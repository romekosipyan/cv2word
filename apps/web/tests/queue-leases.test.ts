import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { DELETE as deleteJob } from "@/app/api/jobs/[id]/route";
import { resetDbForTests } from "@/lib/db";
import {
  acquireWorkerLease,
  publishWorkerState,
} from "@/lib/jobs/lease";
import { countQuotaJobsSince, findJobById } from "@/lib/jobs/repository";
import { processOneSimulatedJob } from "@/lib/jobs/worker-sim";
import {
  assertSafeQueuePayload,
  destinationOutputKey,
  getInMemoryJobQueue,
  resetJobQueueForTests,
} from "@/lib/queue";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import {
  getObjectStorage,
  resetObjectStorageForTests,
} from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";
const FIXTURES = path.resolve(
  __dirname,
  "../../../workers/convert/inspect/fixtures",
);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us012-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
}

async function createAuthorizedJob(idempotencyKey: string): Promise<{
  id: string;
  secret: string;
  objectKey: string;
  sessionCookie: string;
}> {
  const res = await createJob(
    new Request(`${ORIGIN}/api/jobs`, {
      method: "POST",
      headers: baseHeaders({
        "idempotency-key": idempotencyKey,
        "content-type": "application/json",
      }),
    }),
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const all = setCookies.length
    ? setCookies
    : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const sid = all.find((c) => c.startsWith("rtw_sid="))!.split(";")[0];
  return {
    id: body.id as string,
    secret: body.secret as string,
    objectKey: body.upload.objectKey as string,
    sessionCookie: sid,
  };
}

async function putGoodPdf(objectKey: string): Promise<void> {
  const bytes = fs.readFileSync(path.join(FIXTURES, "a4_text.pdf"));
  await getObjectStorage().putObject(objectKey, bytes);
}

async function complete(id: string, secret: string): Promise<Response> {
  return completeUpload(
    new Request(`${ORIGIN}/api/jobs/${id}/complete-upload`, {
      method: "POST",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("US-012 queue leases and retries", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "50";
    process.env.QUEUE_VISIBILITY_TIMEOUT_SECONDS = "120";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests(120);
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("queue message carries job references only (no secret or bytes)", async () => {
    const job = await createAuthorizedJob("us012-payload");
    await putGoodPdf(job.objectKey);
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(200);

    const queue = getInMemoryJobQueue();
    const [msg] = await queue.receive(1);
    expect(msg).toBeTruthy();
    assertSafeQueuePayload(msg!.body);
    expect(Object.keys(msg!.body).sort()).toEqual([
      "jobId",
      "outputObjectKey",
    ]);
    expect(msg!.body.jobId).toBe(job.id);
    expect(msg!.body.outputObjectKey).toBe(destinationOutputKey(job.id));

    const raw = JSON.stringify(msg!.body);
    expect(raw).not.toContain(job.secret);
    expect(raw.toLowerCase()).not.toMatch(/bearer|authorization|token/);
    expect(Buffer.byteLength(raw)).toBeLessThan(512);
    // No PDF magic / large binary smuggled as string fields.
    expect(raw).not.toContain("%PDF");
  });

  it("worker may publish state only with a current lease", async () => {
    const job = await createAuthorizedJob("us012-lease");
    await putGoodPdf(job.objectKey);
    await complete(job.id, job.secret);

    const bad = publishWorkerState(job.id, "not-a-real-lease", {
      state: "processing",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("lease_invalid");
    expect(findJobById(job.id)?.state).toBe("queued");

    const acquired = acquireWorkerLease(
      job.id,
      new Date(Date.now() + 60_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) return;

    const good = publishWorkerState(job.id, acquired.leaseToken, {
      state: "validating",
    });
    expect(good.ok).toBe(true);
    expect(findJobById(job.id)?.state).toBe("validating");
  });

  it("tombstone blocks worker state publish", async () => {
    const job = await createAuthorizedJob("us012-tombstone");
    await putGoodPdf(job.objectKey);
    await complete(job.id, job.secret);

    const acquired = acquireWorkerLease(
      job.id,
      new Date(Date.now() + 60_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) return;

    await deleteJob(
      new Request(`${ORIGIN}/api/jobs/${job.id}`, {
        method: "DELETE",
        headers: baseHeaders({ authorization: `Bearer ${job.secret}` }),
      }),
      { params: Promise.resolve({ id: job.id }) },
    );
    expect(findJobById(job.id)?.tombstone).toBe(1);

    const blocked = publishWorkerState(job.id, acquired.leaseToken, {
      state: "succeeded",
      outputObjectKey: destinationOutputKey(job.id),
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("tombstone");
    expect(findJobById(job.id)?.state).toBe("deleting");
  });

  it("infrastructure failures retry once then fail", async () => {
    const job = await createAuthorizedJob("us012-infra");
    await putGoodPdf(job.objectKey);
    await complete(job.id, job.secret);

    let attempts = 0;
    const first = await processOneSimulatedJob(async () => {
      attempts += 1;
      return { ok: false, kind: "infra", code: "conversion_failed" };
    });
    expect(first.handled).toBe(true);
    if (first.handled) {
      expect(first.outcome).toBe("infra_retry_scheduled");
      expect(first.receiveCount).toBe(1);
    }
    expect(findJobById(job.id)?.state).toBe("queued");
    expect(findJobById(job.id)?.leaseToken).toBeNull();

    const second = await processOneSimulatedJob(async () => {
      attempts += 1;
      return { ok: false, kind: "infra", code: "conversion_failed" };
    });
    expect(second.handled).toBe(true);
    if (second.handled) {
      expect(second.outcome).toBe("infra_exhausted");
      expect(second.receiveCount).toBe(2);
    }
    expect(attempts).toBe(2);
    const final = findJobById(job.id)!;
    expect(final.state).toBe("failed");
    expect(final.errorCode).toBe("conversion_failed");

    // No third infra attempt via the primary queue.
    const third = await processOneSimulatedJob(async () => {
      attempts += 1;
      return { ok: true };
    });
    expect(third).toEqual({ handled: false, reason: "empty" });
    expect(attempts).toBe(2);
  });

  it("validation failures are not retried as infrastructure", async () => {
    const job = await createAuthorizedJob("us012-validation");
    await putGoodPdf(job.objectKey);
    await complete(job.id, job.secret);

    let attempts = 0;
    const result = await processOneSimulatedJob(async () => {
      attempts += 1;
      return { ok: false, kind: "validation", code: "output_invalid" };
    });
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.outcome).toBe("validation_failed");
    expect(attempts).toBe(1);

    const row = findJobById(job.id)!;
    expect(row.state).toBe("failed");
    expect(row.errorCode).toBe("output_invalid");

    const again = await processOneSimulatedJob(async () => {
      attempts += 1;
      return { ok: true };
    });
    expect(again).toEqual({ handled: false, reason: "empty" });
    expect(attempts).toBe(1);
  });

  it("duplicate complete-upload keeps one logical job and counts quota once", async () => {
    const job = await createAuthorizedJob("us012-quota");
    await putGoodPdf(job.objectKey);

    const first = await complete(job.id, job.secret);
    expect(first.status).toBe(200);
    const second = await complete(job.id, job.secret);
    expect(second.status).toBe(200);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Session id is opaque; count via job row instead of session helper when needed.
    const row = findJobById(job.id)!;
    expect(row.quotaCounted).toBe(1);
    expect(row.state).toBe("queued");
    expect(countQuotaJobsSince(row.sessionId, since)).toBe(1);

    const queue = getInMemoryJobQueue();
    // Idempotent enqueue: still a single live message.
    expect(queue.pendingCount() + queue.inFlightCount()).toBe(1);

    const ok = await processOneSimulatedJob(async () => ({ ok: true }));
    expect(ok.handled && ok.outcome === "succeeded").toBe(true);
    expect(findJobById(job.id)?.outputObjectKey).toBe(
      destinationOutputKey(job.id),
    );
    expect(countQuotaJobsSince(row.sessionId, since)).toBe(1);
  });

  it("simulated worker success path uses lease and sticky destination key", async () => {
    const job = await createAuthorizedJob("us012-success");
    await putGoodPdf(job.objectKey);
    await complete(job.id, job.secret);

    const result = await processOneSimulatedJob(async ({ job: j, message }) => {
      expect(j.leaseToken).toBeTruthy();
      expect(message.body.outputObjectKey).toBe(destinationOutputKey(job.id));
      return { ok: true };
    });
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.outcome).toBe("succeeded");
    const row = findJobById(job.id)!;
    expect(row.state).toBe("succeeded");
    expect(row.leaseToken).toBeNull();
    expect(row.outputObjectKey).toBe(destinationOutputKey(job.id));
  });
});
