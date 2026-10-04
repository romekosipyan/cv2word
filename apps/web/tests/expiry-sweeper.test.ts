import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import {
  GET as getJob,
} from "@/app/api/jobs/[id]/route";
import { GET as downloadJob } from "@/app/api/jobs/[id]/download/route";
import { getConfig } from "@/lib/config";
import { resetDbForTests } from "@/lib/db";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import {
  runExpirySweeper,
  stopExpirySweeperForTests,
} from "@/lib/jobs/sweeper";
import {
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us030-"));
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

describe("US-030 automatic expiry sweeper", () => {
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
    process.env.EXPIRY_SWEEP_INTERVAL_SECONDS = "300";
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

  it("sets access expiry 60 minutes after create for abandoned uploads", async () => {
    const before = Date.now();
    const { id } = await createAuthorizedJob("us030-abandon");
    const job = findJobById(id)!;
    const expires = new Date(job.expiresAt).getTime();
    const ttlMs = getConfig().jobAccessTtlSeconds * 1000;
    expect(ttlMs).toBe(3_600_000);
    expect(expires).toBeGreaterThanOrEqual(before + ttlMs - 5_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + ttlMs + 5_000);
  });

  it("resets access expiry to 60 minutes after upload completes", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us030-complete");
    // Force an early create-window so reset is observable.
    updateJob(id, {
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await putGoodPdf(objectKey);
    const before = Date.now();
    const res = await complete(id, secret);
    expect(res.status).toBe(200);
    const job = findJobById(id)!;
    const expires = new Date(job.expiresAt).getTime();
    const ttlMs = getConfig().jobAccessTtlSeconds * 1000;
    expect(expires).toBeGreaterThanOrEqual(before + ttlMs - 5_000);
    expect(expires).toBeLessThanOrEqual(Date.now() + ttlMs + 5_000);
    expect(job.state).toBe("queued");
  });

  it("returns neutral expired on status and download after access window", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us030-neutral");
    await putGoodPdf(objectKey);
    await complete(id, secret);
    updateJob(id, {
      state: "succeeded",
      outputObjectKey: `outputs/${id}/resume-editable.docx`,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    await getObjectStorage().putObject(
      `outputs/${id}/resume-editable.docx`,
      Buffer.from("PK-fake-docx"),
    );

    const status = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(status.status).toBe(410);
    expect(await status.json()).toEqual({ error: "expired" });

    const dl = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(dl.status).toBe(410);
    expect(await dl.json()).toEqual({ error: "expired" });
    expect(dl.headers.get("content-type")).not.toMatch(/wordprocessingml/);
  });

  it("sweeper tombstones, deletes objects, drains queue, marks deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us030-sweep");
    await putGoodPdf(objectKey);
    await complete(id, secret);
    const outputKey = `outputs/${id}/resume-editable.docx`;
    await getObjectStorage().putObject(outputKey, Buffer.from("PK-out"));
    updateJob(id, {
      state: "succeeded",
      outputObjectKey: outputKey,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    // Ghost queue message after terminal success (US-012 warning).
    await getInMemoryJobQueue().enqueue({
      jobId: id,
      outputObjectKey: outputKey,
    });
    expect(getInMemoryJobQueue().hasLiveMessage(id)).toBe(true);
    expect(await getObjectStorage().objectExists(objectKey)).toBe(true);

    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await runExpirySweeper(new Date());
    expect(result.markedDeleted).toBeGreaterThanOrEqual(1);
    expect(result.objectsRemoved).toBeGreaterThanOrEqual(1);

    const job = findJobById(id)!;
    expect(job.state).toBe("deleted");
    expect(job.tombstone).toBe(1);
    expect(job.originalObjectKey).toBeNull();
    expect(job.outputObjectKey).toBeNull();
    expect(await getObjectStorage().objectExists(objectKey)).toBe(false);
    expect(await getObjectStorage().objectExists(outputKey)).toBe(false);
    expect(getInMemoryJobQueue().hasLiveMessage(id)).toBe(false);
    expect(getInMemoryJobQueue().isInDeadLetter(id)).toBe(false);

    // After verified deletion, access is unauthorized (neutral unavailable).
    const after = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: "unauthorized" });

    const dumped = spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped.toLowerCase()).not.toMatch(/resume text|lorem ipsum/);
    expect(dumped).not.toContain(secret);
  });

  it("clears expired leases and reconciles DLQ'd in-flight jobs", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us030-dlq");
    await putGoodPdf(objectKey);
    await complete(id, secret);

    updateJob(id, {
      state: "processing",
      leaseToken: "stale-lease-token",
      leaseExpiresAt: new Date(Date.now() - 5_000).toISOString(),
    });
    expect(getInMemoryJobQueue().forceDeadLetter(id)).toBe(true);
    expect(getInMemoryJobQueue().isInDeadLetter(id)).toBe(true);
    expect(getInMemoryJobQueue().hasLiveMessage(id)).toBe(false);

    const result = await runExpirySweeper(new Date());
    expect(result.leasesCleared + result.dlqReconciled).toBeGreaterThanOrEqual(1);

    const job = findJobById(id)!;
    expect(job.leaseToken).toBeNull();
    expect(job.state).toBe("failed");
    expect(job.errorCode).toBe("conversion_failed");
    expect(getInMemoryJobQueue().isInDeadLetter(id)).toBe(false);

    // Still within access window — status is reachable with failure code.
    const status = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(status.status).toBe(200);
    const body = await status.json();
    expect(body.state).toBe("failed");
    expect(body.error).toBe("conversion_failed");
  });

  it("sweeper interval config defaults to 5 minutes", () => {
    expect(getConfig().expirySweepIntervalSeconds).toBe(300);
  });

  it("does not log resume text during sweep", async () => {
    const { id, objectKey } = await createAuthorizedJob("us030-nolog");
    await putGoodPdf(objectKey);
    updateJob(id, {
      expiresAt: new Date(Date.now() - 1).toISOString(),
    });
    const spyInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const spyWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runExpirySweeper(new Date());
    const dumped = [...spyInfo.mock.calls, ...spyWarn.mock.calls]
      .map((c) => c.map(String).join(" "))
      .join("\n");
    expect(dumped).not.toMatch(/Curriculum Vitae|Experience|Education/i);
    expect(dumped).not.toContain("%PDF");
  });
});
