import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { DELETE as deleteJob } from "@/app/api/jobs/[id]/route";
import { resetDbForTests } from "@/lib/db";
import { runExpirySweeper } from "@/lib/jobs/sweeper";
import { resetJobQueueForTests } from "@/lib/queue";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import { resetObjectStorageForTests } from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us112-"));
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

describe("US-112 UPLOADS_DISABLED feature shutdown", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.WORKER_TEMP_ROOT = path.join(root, "worker-temp");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "10";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    delete process.env.UPLOADS_DISABLED;
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    delete process.env.UPLOADS_DISABLED;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects POST /api/jobs with queue_full when uploads are disabled", async () => {
    process.env.UPLOADS_DISABLED = "true";
    const res = await postCreate("us112-shutdown-create");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3600");
    const body = await res.json();
    expect(body).toEqual({
      error: "queue_full",
      retryAfterSeconds: 3600,
    });
    expect(body.id).toBeUndefined();
    expect(body.secret).toBeUndefined();
  });

  it("allows create when UPLOADS_DISABLED is unset", async () => {
    const res = await postCreate("us112-open-create");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
  });

  it("keeps DELETE and expiry sweeper usable while uploads are disabled", async () => {
    const created = await postCreate("us112-then-shutdown");
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      secret: string;
      expiresAt: string;
    };

    process.env.UPLOADS_DISABLED = "true";

    const blocked = await postCreate("us112-blocked-after");
    expect(blocked.status).toBe(503);

    const del = await deleteJob(
      new Request(`${ORIGIN}/api/jobs/${body.id}`, {
        method: "DELETE",
        headers: baseHeaders({
          authorization: `Bearer ${body.secret}`,
        }),
      }),
      { params: Promise.resolve({ id: body.id }) },
    );
    expect(del.status).toBe(202);

    // Sweeper must not throw while intake is halted.
    const sweep = await runExpirySweeper(
      new Date(Date.parse(body.expiresAt) + 60_000),
    );
    expect(sweep).toBeTruthy();
    expect(typeof sweep.markedDeleted).toBe("number");
  });
});
