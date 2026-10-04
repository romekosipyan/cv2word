import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import {
  DELETE as deleteJob,
  GET as getJob,
} from "@/app/api/jobs/[id]/route";
import { GET as downloadJob } from "@/app/api/jobs/[id]/download/route";
import { resetDbForTests } from "@/lib/db";
import {
  acquireWorkerLease,
  publishWorkerState,
} from "@/lib/jobs/lease";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import {
  reconcileUserDeletion,
  runExpirySweeper,
  stopExpirySweeperForTests,
} from "@/lib/jobs/sweeper";
import { processOneSimulatedJob } from "@/lib/jobs/worker-sim";
import {
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us031-"));
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
  return {
    id: body.id as string,
    secret: body.secret as string,
    objectKey: body.upload.objectKey as string,
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

async function del(id: string, secret: string): Promise<Response> {
  return deleteJob(
    new Request(`${ORIGIN}/api/jobs/${id}`, {
      method: "DELETE",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("US-031 user delete and cancel", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "50";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    process.env.RATE_LIMIT_POLL_MAX = "100";
    process.env.RATE_LIMIT_DOWNLOAD_MAX = "100";
    process.env.JOB_ACCESS_TTL_SECONDS = "3600";
    process.env.VITEST = "true";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    stopExpirySweeperForTests();
  });

  afterEach(() => {
    stopExpirySweeperForTests();
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("DELETE revokes access immediately with 202 delete_pending", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us031-revoke");
    await putGoodPdf(objectKey);

    const res = await del(id, secret);
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ error: "delete_pending" });

    const job = findJobById(id)!;
    expect(job.tombstone).toBe(1);
    expect(job.state).toBe("deleting");
    expect(job.leaseToken).toBeNull();
    expect(job.uploadTokenHash).toBeNull();

    // Access revoked before physical cleanup — UI must keep showing pending,
    // never “deleted”, until reconcile marks deleted (US-032 verification).
    const status = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(status.status).toBe(202);
    expect(await status.json()).toEqual({ error: "delete_pending" });
    expect(job.state).not.toBe("deleted");
  });

  it("idempotent DELETE while cleanup pending still returns 202", async () => {
    const { id, secret } = await createAuthorizedJob("us031-idem");
    expect((await del(id, secret)).status).toBe(202);
    const again = await del(id, secret);
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual({ error: "delete_pending" });
    expect(findJobById(id)?.state).toBe("deleting");
  });

  it("cancel while queued: tombstone blocks worker publish and result", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us031-queued");
    await putGoodPdf(objectKey);
    expect((await complete(id, secret)).status).toBe(200);
    expect(findJobById(id)?.state).toBe("queued");
    expect(getInMemoryJobQueue().hasLiveMessage(id)).toBe(true);

    expect((await del(id, secret)).status).toBe(202);
    const job = findJobById(id)!;
    expect(job.tombstone).toBe(1);
    expect(job.state).toBe("deleting");
    expect(job.leaseToken).toBeNull();

    const acquired = acquireWorkerLease(id, new Date(Date.now() + 60_000));
    expect(acquired.ok).toBe(false);
    if (!acquired.ok) expect(acquired.reason).toBe("tombstone");

    const sim = await processOneSimulatedJob(async () => ({ ok: true }));
    expect(sim.handled).toBe(true);
    if (sim.handled) {
      expect(sim.outcome).toBe("skipped_tombstone");
    }
    expect(findJobById(id)?.state).toBe("deleting");
    expect(findJobById(id)?.state).not.toBe("succeeded");
  });

  it("cancel while processing: tombstone wins; worker does not publish success", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob(
      "us031-processing",
    );
    await putGoodPdf(objectKey);
    await complete(id, secret);

    const acquired = acquireWorkerLease(id, new Date(Date.now() + 60_000));
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) return;
    expect(findJobById(id)?.state).toBe("processing");

    expect((await del(id, secret)).status).toBe(202);
    expect(findJobById(id)?.leaseToken).toBeNull();

    const blocked = publishWorkerState(id, acquired.leaseToken, {
      state: "succeeded",
      outputObjectKey: destinationOutputKey(id),
      engineVersion: "sim-0",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("tombstone");
    expect(findJobById(id)?.state).toBe("deleting");
  });

  it("download does not delete the job or objects", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us031-dl");
    await putGoodPdf(objectKey);
    await complete(id, secret);
    const outputKey = destinationOutputKey(id);
    await getObjectStorage().putObject(outputKey, Buffer.from("PK-docx"));
    updateJob(id, {
      state: "succeeded",
      outputObjectKey: outputKey,
    });

    const dl = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(dl.status).toBe(200);

    const job = findJobById(id)!;
    expect(job.state).toBe("succeeded");
    expect(job.tombstone).toBe(0);
    expect(await getObjectStorage().objectExists(objectKey)).toBe(true);
    expect(await getObjectStorage().objectExists(outputKey)).toBe(true);

    // Still downloadable after first download (download ≠ delete).
    const dl2 = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(dl2.status).toBe(200);
  });

  it("reconcile after user DELETE marks deleted only when object+queue clean", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us031-clean");
    await putGoodPdf(objectKey);
    await complete(id, secret);
    const outputKey = destinationOutputKey(id);
    await getObjectStorage().putObject(outputKey, Buffer.from("PK-out"));
    updateJob(id, {
      state: "succeeded",
      outputObjectKey: outputKey,
    });

    expect((await del(id, secret)).status).toBe(202);
    expect(findJobById(id)?.state).toBe("deleting");
    // Objects still present until reconcile (do not claim deleted yet).
    expect(await getObjectStorage().objectExists(objectKey)).toBe(true);

    await reconcileUserDeletion(id);

    const job = findJobById(id)!;
    expect(job.state).toBe("deleted");
    expect(job.tombstone).toBe(1);
    expect(await getObjectStorage().objectExists(objectKey)).toBe(false);
    expect(await getObjectStorage().objectExists(outputKey)).toBe(false);
    expect(getInMemoryJobQueue().hasLiveMessage(id)).toBe(false);

    const after = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: "unauthorized" });
  });

  it("expiry sweeper also finishes user-delete pending jobs", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us031-sweep");
    await putGoodPdf(objectKey);
    expect((await del(id, secret)).status).toBe(202);

    const result = await runExpirySweeper(new Date());
    expect(result.markedDeleted).toBeGreaterThanOrEqual(1);
    expect(findJobById(id)?.state).toBe("deleted");
    expect(await getObjectStorage().objectExists(objectKey)).toBe(false);
  });

  it("delete path logs omit secrets and resume text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { id, secret, objectKey } = await createAuthorizedJob("us031-logs");
    const pdfBytes = fs.readFileSync(path.join(FIXTURES, "a4_text.pdf"));
    await getObjectStorage().putObject(objectKey, pdfBytes);
    await complete(id, secret);

    await del(id, secret);
    await reconcileUserDeletion(id);

    const dumped = [...info.mock.calls, ...warn.mock.calls]
      .map((c) => c.map(String).join(" "))
      .join("\n");
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain("Resume of");
    expect(dumped).not.toMatch(/%PDF/);
    expect(dumped).toMatch(/job_delete_pending|deletion_completed/);
  });
});
