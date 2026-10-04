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
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import { resetObjectStorageForTests } from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us003-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
}

async function postCreate(
  idempotencyKey: string,
  cookie?: string,
): Promise<Response> {
  const headers = baseHeaders({
    "idempotency-key": idempotencyKey,
    "content-type": "application/json",
  });
  if (cookie) headers.set("cookie", cookie);
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
    : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  const sid = all.find((c) => c.startsWith("rtw_sid="));
  if (!sid) return undefined;
  return sid.split(";")[0];
}

function jobCookieFrom(res: Response, jobId: string): string | undefined {
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  const all = setCookies.length
    ? setCookies
    : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  const prefix = `rtw_job_${jobId}=`;
  const match = all.find((c) => c.startsWith(prefix));
  if (!match) return undefined;
  return match.split(";")[0];
}

describe("US-003 job API", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "3";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    process.env.RATE_LIMIT_POLL_MAX = "100";
    process.env.RATE_LIMIT_DOWNLOAD_MAX = "100";
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

  it("creates a job with idempotency key and upload authorization", async () => {
    const res = await postCreate("idem-key-001");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.secret).toBeTruthy();
    expect(body.secret.length).toBeGreaterThan(20);
    expect(body.upload).toMatchObject({
      method: "PUT",
      objectKey: expect.stringContaining(body.id),
    });
    expect(body.upload.url).toContain("/api/dev/upload");
    expect(body.upload.headers.Authorization).toMatch(/^Upload /);
    expect(String(body.upload.url)).not.toContain(body.secret);
    expect(sessionCookieFrom(res)).toBeTruthy();
    expect(jobCookieFrom(res, body.id)).toBeTruthy();
  });

  it("is idempotent for the same session + idempotency key", async () => {
    const first = await postCreate("idem-key-same");
    const firstBody = await first.json();
    const sid = sessionCookieFrom(first)!;

    const second = await postCreate("idem-key-same", sid);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.secret).toBeUndefined();
    expect(secondBody.upload?.url).toBeTruthy();
  });

  it("rejects job-id-alone as unauthorized and returns no file bytes", async () => {
    const created = await postCreate("idem-auth-alone");
    const { id } = await created.json();

    const statusRes = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, { method: "GET" }),
      { params: Promise.resolve({ id }) },
    );
    expect(statusRes.status).toBe(401);
    const statusBody = await statusRes.json();
    expect(statusBody.error).toBe("unauthorized");

    const dl = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, { method: "GET" }),
      { params: Promise.resolve({ id }) },
    );
    expect([401, 404]).toContain(dl.status);
    const dlBody = await dl.json();
    expect(dlBody.error).toBe("unauthorized");
    expect(dl.headers.get("content-type")).not.toMatch(/wordprocessingml/);
  });

  it("requires the high-entropy secret for subsequent routes", async () => {
    const created = await postCreate("idem-secret-req");
    const { id, secret } = await created.json();

    const denied = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: "Bearer wrong-secret-value-xxxxxxxxxx" },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(denied.status).toBe(401);

    const ok = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.id).toBe(id);
    expect(body.state).toBe("uploading");
    expect(body).not.toHaveProperty("secret");
  });

  it("rejects secrets presented in the query string", async () => {
    const created = await postCreate("idem-query-secret");
    const { id, secret } = await created.json();

    const res = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}?secret=${encodeURIComponent(secret)}`, {
        method: "GET",
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(401);
  });

  it("enforces one active job per anonymous session", async () => {
    const first = await postCreate("idem-active-1");
    expect(first.status).toBe(201);
    const sid = sessionCookieFrom(first)!;

    const second = await postCreate("idem-active-2", sid);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    const body = await second.json();
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("does not log the job secret on the happy-path create", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await postCreate("idem-log-redact");
    const { secret } = await res.json();
    expect(res.status).toBe(201);
    expect(secret).toBeTruthy();

    const dumped = spy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).not.toContain(secret);
    expect(dumped.toLowerCase()).not.toMatch(/"secret"\s*:\s*"[^[]/);
  });

  it("DELETE revokes access with 202 delete_pending", async () => {
    const created = await postCreate("idem-delete");
    const { id, secret } = await created.json();

    const del = await deleteJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "DELETE",
        headers: baseHeaders({ authorization: `Bearer ${secret}` }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(del.status).toBe(202);
    const body = await del.json();
    expect(body.error).toBe("delete_pending");

    const after = await getJob(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${secret}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(after.status).toBe(202);
  });
});
