import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import {
  DELETE as deleteJob,
  GET as getJob,
} from "@/app/api/jobs/[id]/route";
import { GET as downloadJob } from "@/app/api/jobs/[id]/download/route";
import { resetDbForTests } from "@/lib/db";
import { updateJob } from "@/lib/jobs/repository";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import {
  getObjectStorage,
  resetObjectStorageForTests,
} from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us040-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
}

async function postCreate(
  idempotencyKey: string,
  options?: { cookie?: string; forwardedFor?: string },
): Promise<Response> {
  const headers = baseHeaders({
    "idempotency-key": idempotencyKey,
    "content-type": "application/json",
  });
  if (options?.cookie) headers.set("cookie", options.cookie);
  if (options?.forwardedFor) {
    headers.set("x-forwarded-for", options.forwardedFor);
  }
  return createJob(
    new Request(`${ORIGIN}/api/jobs`, {
      method: "POST",
      headers,
    }),
  );
}

function sessionCookieFrom(res: Response): string | undefined {
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const all = setCookies.length
    ? setCookies
    : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);
  const sid = all.find((c) => c.startsWith("rtw_sid="));
  return sid?.split(";")[0];
}

describe("US-040 quota and rate limits", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "3";
    process.env.FREE_QUOTA_WINDOW_SECONDS = String(24 * 60 * 60);
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    process.env.RATE_LIMIT_POLL_MAX = "100";
    process.env.RATE_LIMIT_DOWNLOAD_MAX = "100";
    process.env.ACTIVE_JOB_RETRY_AFTER_SECONDS = "30";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("enforces configurable free quota (default 3/24h) once per logical job", async () => {
    const first = await postCreate("quota-job-1");
    expect(first.status).toBe(201);
    const { id: id1, secret: secret1 } = await first.json();
    const sid = sessionCookieFrom(first)!;

    await deleteJob(
      new Request(`${ORIGIN}/api/jobs/${id1}`, {
        method: "DELETE",
        headers: baseHeaders({ authorization: `Bearer ${secret1}` }),
      }),
      { params: Promise.resolve({ id: id1 }) },
    );

    for (let i = 2; i <= 3; i++) {
      const res = await postCreate(`quota-job-${i}`, { cookie: sid });
      expect(res.status).toBe(201);
      const body = await res.json();
      await deleteJob(
        new Request(`${ORIGIN}/api/jobs/${body.id}`, {
          method: "DELETE",
          headers: baseHeaders({ authorization: `Bearer ${body.secret}` }),
        }),
        { params: Promise.resolve({ id: body.id }) },
      );
    }

    const blocked = await postCreate("quota-job-4", { cookie: sid });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    const body = await blocked.json();
    expect(body).toEqual({
      error: "rate_limited",
      retryAfterSeconds: expect.any(Number),
    });
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(body.id).toBeUndefined();
    expect(body.secret).toBeUndefined();
  });

  it("active-job limit includes Retry-After and does not charge a new job", async () => {
    const first = await postCreate("active-1");
    expect(first.status).toBe(201);
    const sid = sessionCookieFrom(first)!;

    const second = await postCreate("active-2", { cookie: sid });
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBe("30");
    const body = await second.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBe(30);
    expect(body.secret).toBeUndefined();
  });

  it("rate limits create by client address (cookie rotation cannot bypass)", async () => {
    process.env.RATE_LIMIT_CREATE_MAX = "2";
    process.env.RATE_LIMIT_CREATE_WINDOW_SECONDS = "60";
    resetRateLimiterForTests();

    const a = await postCreate("rl-create-1", { forwardedFor: "203.0.113.10" });
    const b = await postCreate("rl-create-2", { forwardedFor: "203.0.113.10" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const blocked = await postCreate("rl-create-3", {
      forwardedFor: "203.0.113.10",
    });
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(body.id).toBeUndefined();

    const otherIp = await postCreate("rl-create-other", {
      forwardedFor: "203.0.113.99",
    });
    expect(otherIp.status).toBe(201);
  });

  it("rate limits poll with retry timing", async () => {
    process.env.RATE_LIMIT_POLL_MAX = "2";
    process.env.RATE_LIMIT_POLL_WINDOW_SECONDS = "60";
    resetRateLimiterForTests();

    const created = await postCreate("rl-poll-job");
    expect(created.status).toBe(201);
    const { id, secret } = await created.json();

    const ok1 = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-forwarded-for": "198.51.100.1",
        },
      }),
      { params: Promise.resolve({ id }) },
    );
    const ok2 = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-forwarded-for": "198.51.100.1",
        },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(ok1.status).toBe(200);
    expect(ok2.status).toBe(200);

    const blocked = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-forwarded-for": "198.51.100.1",
        },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate limits download with retry timing (not remapped to unauthorized)", async () => {
    process.env.RATE_LIMIT_DOWNLOAD_MAX = "1";
    process.env.RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS = "60";
    resetRateLimiterForTests();

    const created = await postCreate("rl-download");
    const { id, secret } = await created.json();
    const outputKey = `outputs/${id}/resume-editable.docx`;
    await getObjectStorage().putObject(outputKey, Buffer.from("PK-fake-docx"));
    updateJob(id, { state: "succeeded", outputObjectKey: outputKey });

    const ok = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-forwarded-for": "198.51.100.2",
        },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(ok.status).toBe(200);

    const blocked = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-forwarded-for": "198.51.100.2",
        },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("idempotent create replay does not consume additional quota", async () => {
    process.env.FREE_QUOTA_PER_24H = "1";
    resetRateLimiterForTests();

    const first = await postCreate("idem-quota");
    expect(first.status).toBe(201);
    const sid = sessionCookieFrom(first)!;
    const firstBody = await first.json();

    const replay = await postCreate("idem-quota", { cookie: sid });
    expect(replay.status).toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.id).toBe(firstBody.id);
    expect(replayBody.secret).toBeUndefined();

    await deleteJob(
      new Request(`${ORIGIN}/api/jobs/${firstBody.id}`, {
        method: "DELETE",
        headers: baseHeaders({
          authorization: `Bearer ${firstBody.secret}`,
        }),
      }),
      { params: Promise.resolve({ id: firstBody.id }) },
    );

    const next = await postCreate("idem-quota-next", { cookie: sid });
    expect(next.status).toBe(429);
    const body = await next.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("does not log filenames, secrets, or resume text on quota/rate rejects", async () => {
    process.env.RATE_LIMIT_CREATE_MAX = "1";
    resetRateLimiterForTests();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = await postCreate("log-rl-1", { forwardedFor: "192.0.2.1" });
    const { secret } = await first.json();
    expect(secret).toBeTruthy();

    await postCreate("log-rl-2", { forwardedFor: "192.0.2.1" });

    const dumped = spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).not.toContain(secret);
    expect(dumped.toLowerCase()).not.toMatch(/resume text|filename|\.pdf/);
    expect(dumped).not.toMatch(/192\.0\.2\.1/);
  });
});
