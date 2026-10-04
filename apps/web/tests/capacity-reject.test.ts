import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { decideCapacity, predictWaitSeconds } from "@/lib/capacity";
import { resetDbForTests } from "@/lib/db";
import {
  getInMemoryJobQueue,
  resetJobQueueForTests,
} from "@/lib/queue";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import { resetObjectStorageForTests } from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us041-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
}

async function postCreate(idempotencyKey: string): Promise<Response> {
  return createJob(
    new Request(`${ORIGIN}/api/jobs`, {
      method: "POST",
      headers: baseHeaders({
        "idempotency-key": idempotencyKey,
        "content-type": "application/json",
      }),
    }),
  );
}

describe("US-041 capacity predictor", () => {
  it("uses ADR-002 formula (queued + in_flight) * p50 / ready_workers", () => {
    expect(
      predictWaitSeconds({
        queued: 20,
        inFlight: 20,
        readyWorkers: 10,
        p50JobSeconds: 30,
      }),
    ).toBe(120);

    expect(
      predictWaitSeconds({
        queued: 21,
        inFlight: 20,
        readyWorkers: 10,
        p50JobSeconds: 30,
      }),
    ).toBe(123);
  });

  it("rejects when predicted wait exceeds max (placeholder p50, not measured)", () => {
    const admit = decideCapacity({
      queued: 40,
      inFlight: 0,
      readyWorkers: 10,
      p50JobSeconds: 30,
      maxWaitSeconds: 120,
    });
    expect(admit.admit).toBe(true);
    expect(admit.predictedWaitSeconds).toBe(120);

    const reject = decideCapacity({
      queued: 41,
      inFlight: 0,
      readyWorkers: 10,
      p50JobSeconds: 30,
      maxWaitSeconds: 120,
    });
    expect(reject.admit).toBe(false);
    expect(reject.predictedWaitSeconds).toBeGreaterThan(120);
    expect(reject.retryAfterSeconds).toBeGreaterThanOrEqual(30);
    expect(reject.retryAfterSeconds).toBeLessThanOrEqual(120);
  });

  it("treats ready_workers < 1 as 1 (no divide-by-zero)", () => {
    expect(
      predictWaitSeconds({
        queued: 2,
        inFlight: 0,
        readyWorkers: 0,
        p50JobSeconds: 30,
      }),
    ).toBe(60);
  });
});

describe("US-041 POST /api/jobs queue_full", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "10";
    // One ready worker, p50=60 → reject when depth > 2 (wait > 120).
    process.env.CAPACITY_READY_WORKERS = "1";
    process.env.CAPACITY_P50_JOB_SECONDS = "60";
    process.env.CAPACITY_MAX_WAIT_SECONDS = "120";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.CAPACITY_READY_WORKERS;
    delete process.env.CAPACITY_P50_JOB_SECONDS;
    delete process.env.CAPACITY_MAX_WAIT_SECONDS;
  });

  it("admits when predicted wait is within the two-minute bound", async () => {
    getInMemoryJobQueue().seedVisibleMessages(2);
    const res = await postCreate("capacity-admit-001");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.error).toBeUndefined();
  });

  it("rejects with queue_full + Retry-After and does not create a job", async () => {
    getInMemoryJobQueue().seedVisibleMessages(3);
    const res = await postCreate("capacity-reject-001");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({
      error: "queue_full",
      retryAfterSeconds: expect.any(Number),
    });
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(30);
    // No charge: no job row / no secret issued.
    expect(body.id).toBeUndefined();
    expect(body.secret).toBeUndefined();
  });

  it("does not invent a progress percentage on reject", async () => {
    getInMemoryJobQueue().seedVisibleMessages(5);
    const res = await postCreate("capacity-reject-no-pct");
    const body = await res.json();
    expect(body.progress).toBeUndefined();
    expect(body.percent).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/%/);
  });
});
