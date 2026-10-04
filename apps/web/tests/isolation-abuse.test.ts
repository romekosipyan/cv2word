import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import {
  DELETE as deleteJob,
  GET as getJob,
} from "@/app/api/jobs/[id]/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { GET as downloadJob } from "@/app/api/jobs/[id]/download/route";
import { generateJobSecret } from "@/lib/crypto";
import { resetDbForTests } from "@/lib/db";
import {
  countQuotaJobsSince,
  findJobById,
  updateJob,
} from "@/lib/jobs/repository";
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
const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURES = path.join(
  REPO_ROOT,
  "workers/convert/inspect/fixtures",
);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us091-"));
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

async function createAuthorizedJob(
  idempotencyKey: string,
  options?: { cookie?: string; forwardedFor?: string },
): Promise<{ id: string; secret: string; objectKey: string; cookie?: string }> {
  const res = await postCreate(idempotencyKey, options);
  expect(res.status).toBe(201);
  const body = await res.json();
  return {
    id: body.id as string,
    secret: body.secret as string,
    objectKey: body.upload.objectKey as string,
    cookie: sessionCookieFrom(res),
  };
}

async function putFixture(objectKey: string, fixtureName: string): Promise<void> {
  const bytes = fs.readFileSync(path.join(FIXTURES, fixtureName));
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

function assertNoFileBytes(res: Response, body: unknown): void {
  expect(res.headers.get("content-type") ?? "").not.toMatch(
    /wordprocessingml|octet-stream|pdf/i,
  );
  expect(body).toEqual(
    expect.objectContaining({
      error: expect.stringMatching(/^(unauthorized|expired)$/),
    }),
  );
  expect(body).not.toHaveProperty("secret");
  expect(body).not.toHaveProperty("upload");
}

describe("US-091 isolation and abuse", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper-us091";
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
    resetJobQueueForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetRateLimiterForTests();
    resetJobQueueForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("cross-job access fail-closed", () => {
    it("foreign job id + another job's secret returns no file bytes", async () => {
      const jobA = await createAuthorizedJob("us091-cross-a", {
        forwardedFor: "203.0.113.10",
      });
      const jobB = await createAuthorizedJob("us091-cross-b", {
        forwardedFor: "203.0.113.11",
      });

      const outputKey = `outputs/${jobB.id}/resume-editable.docx`;
      const payload = Buffer.from("PK-foreign-job-docx-bytes");
      await getObjectStorage().putObject(outputKey, payload);
      updateJob(jobB.id, { state: "succeeded", outputObjectKey: outputKey });

      const status = await getJob(
        new Request(`${ORIGIN}/api/jobs/${jobB.id}`, {
          method: "GET",
          headers: { authorization: `Bearer ${jobA.secret}` },
        }),
        { params: Promise.resolve({ id: jobB.id }) },
      );
      expect(status.status).toBe(401);
      assertNoFileBytes(status, await status.json());

      const dl = await downloadJob(
        new Request(`${ORIGIN}/api/jobs/${jobB.id}/download`, {
          method: "GET",
          headers: { authorization: `Bearer ${jobA.secret}` },
        }),
        { params: Promise.resolve({ id: jobB.id }) },
      );
      expect(dl.status).toBe(404);
      const dlBody = await dl.json();
      assertNoFileBytes(dl, dlBody);
      expect(dlBody.error).toBe("unauthorized");

      const completeDenied = await complete(jobB.id, jobA.secret);
      expect(completeDenied.status).toBe(401);
      assertNoFileBytes(completeDenied, await completeDenied.json());
    });

    it("plausible high-entropy secret for unknown job id serves no bytes", async () => {
      const plausible = generateJobSecret();
      const missingId = "missing-job-id-us091xxxxxxxxxxx";

      const status = await getJob(
        new Request(`${ORIGIN}/api/jobs/${missingId}`, {
          method: "GET",
          headers: { authorization: `Bearer ${plausible}` },
        }),
        { params: Promise.resolve({ id: missingId }) },
      );
      expect(status.status).toBe(401);
      assertNoFileBytes(status, await status.json());

      const dl = await downloadJob(
        new Request(`${ORIGIN}/api/jobs/${missingId}/download`, {
          method: "GET",
          headers: { authorization: `Bearer ${plausible}` },
        }),
        { params: Promise.resolve({ id: missingId }) },
      );
      expect(dl.status).toBe(404);
      assertNoFileBytes(dl, await dl.json());
    });

    it("expired credentials are unavailable and never return DOCX bytes", async () => {
      const job = await createAuthorizedJob("us091-expired");
      const outputKey = `outputs/${job.id}/resume-editable.docx`;
      await getObjectStorage().putObject(
        outputKey,
        Buffer.from("PK-expired-should-not-download"),
      );
      updateJob(job.id, {
        state: "succeeded",
        outputObjectKey: outputKey,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });

      const status = await getJob(
        new Request(`${ORIGIN}/api/jobs/${job.id}`, {
          method: "GET",
          headers: { authorization: `Bearer ${job.secret}` },
        }),
        { params: Promise.resolve({ id: job.id }) },
      );
      expect(status.status).toBe(410);
      assertNoFileBytes(status, await status.json());

      const dl = await downloadJob(
        new Request(`${ORIGIN}/api/jobs/${job.id}/download`, {
          method: "GET",
          headers: { authorization: `Bearer ${job.secret}` },
        }),
        { params: Promise.resolve({ id: job.id }) },
      );
      expect(dl.status).toBe(410);
      const body = await dl.json();
      expect(body.error).toBe("expired");
      assertNoFileBytes(dl, body);
    });

    it("forged MIME / non-PDF bytes still reject at complete-upload", async () => {
      const job = await createAuthorizedJob("us091-forged-mime");
      // Content-Type claims PDF; bytes are not a PDF (server-side signature wins).
      await getObjectStorage().putObject(
        job.objectKey,
        fs.readFileSync(path.join(FIXTURES, "not_pdf.bin")),
        "application/pdf",
      );
      const res = await complete(job.id, job.secret);
      expect(res.status).toBe(415);
      expect((await res.json()).error).toBe("unsupported_type");
      expect(getInMemoryJobQueue().hasLiveMessage(job.id)).toBe(false);
      expect(findJobById(job.id)?.state).toBe("failed");
    });

    it("rejects secrets presented in query strings on status and download", async () => {
      const job = await createAuthorizedJob("us091-query");
      const outputKey = `outputs/${job.id}/resume-editable.docx`;
      await getObjectStorage().putObject(outputKey, Buffer.from("PK-query"));
      updateJob(job.id, { state: "succeeded", outputObjectKey: outputKey });

      const status = await getJob(
        new Request(
          `${ORIGIN}/api/jobs/${job.id}?secret=${encodeURIComponent(job.secret)}`,
          { method: "GET" },
        ),
        { params: Promise.resolve({ id: job.id }) },
      );
      expect(status.status).toBe(401);

      const dl = await downloadJob(
        new Request(
          `${ORIGIN}/api/jobs/${job.id}/download?token=${encodeURIComponent(job.secret)}`,
          { method: "GET" },
        ),
        { params: Promise.resolve({ id: job.id }) },
      );
      expect(dl.status).toBe(404);
      assertNoFileBytes(dl, await dl.json());
    });
  });

  describe("quota / rate limits vs complete-upload replay", () => {
    it("repeating complete-upload does not re-charge quota or spawn queue ghosts", async () => {
      process.env.FREE_QUOTA_PER_24H = "1";
      resetRateLimiterForTests();

      const job = await createAuthorizedJob("us091-quota-once");
      const sid = job.cookie!;
      await putFixture(job.objectKey, "a4_text.pdf");

      const first = await complete(job.id, job.secret);
      expect(first.status).toBe(200);
      expect((await first.json()).state).toBe("queued");

      const second = await complete(job.id, job.secret);
      const third = await complete(job.id, job.secret);
      expect(second.status).toBe(200);
      expect(third.status).toBe(200);

      const row = findJobById(job.id)!;
      expect(row.quotaCounted).toBe(1);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      expect(countQuotaJobsSince(row.sessionId, since)).toBe(1);

      const liveIds = getInMemoryJobQueue().listLiveJobIds();
      expect(liveIds.filter((id) => id === job.id)).toHaveLength(1);

      await deleteJob(
        new Request(`${ORIGIN}/api/jobs/${job.id}`, {
          method: "DELETE",
          headers: baseHeaders({ authorization: `Bearer ${job.secret}` }),
        }),
        { params: Promise.resolve({ id: job.id }) },
      );

      // Quota still consumed — complete-upload replay cannot mint a free slot.
      const blocked = await postCreate("us091-quota-next", { cookie: sid });
      expect(blocked.status).toBe(429);
      const body = await blocked.json();
      expect(body.error).toBe("rate_limited");
      expect(body.id).toBeUndefined();
      expect(body.secret).toBeUndefined();
    });

    it("complete-upload cannot bypass create rate limits", async () => {
      process.env.RATE_LIMIT_CREATE_MAX = "1";
      process.env.RATE_LIMIT_CREATE_WINDOW_SECONDS = "60";
      resetRateLimiterForTests();

      const job = await createAuthorizedJob("us091-rl-create", {
        forwardedFor: "198.51.100.40",
      });
      await putFixture(job.objectKey, "a4_text.pdf");

      // Spam complete-upload — must not open another create slot for this client.
      for (let i = 0; i < 5; i += 1) {
        const res = await complete(job.id, job.secret);
        expect(res.status).toBe(200);
      }

      const blocked = await postCreate("us091-rl-create-2", {
        forwardedFor: "198.51.100.40",
      });
      expect(blocked.status).toBe(429);
      expect((await blocked.json()).error).toBe("rate_limited");
    });
  });

  describe("worker no-outbound network evidence", () => {
    it("compose isolation and convert runtimes deny all network", () => {
      const isolationCompose = fs.readFileSync(
        path.join(
          REPO_ROOT,
          "infra/convert-worker/docker-compose.isolation.yml",
        ),
        "utf8",
      );
      const convertCompose = fs.readFileSync(
        path.join(REPO_ROOT, "infra/convert-worker/docker-compose.convert.yml"),
        "utf8",
      );

      for (const src of [isolationCompose, convertCompose]) {
        expect(src).toMatch(/network_mode:\s*["']?none["']?/);
        expect(src).not.toMatch(/ports:\s*\n/);
      }
    });

    it("ECS sketch disables public IP, NAT, and default internet route", () => {
      const sketchPath = path.join(
        REPO_ROOT,
        "infra/convert-worker/ecs-task-definition.convert.sketch.json",
      );
      const sketch = JSON.parse(fs.readFileSync(sketchPath, "utf8")) as {
        _network_configuration_sketch: {
          awsvpcConfiguration: {
            assignPublicIp: string;
            securityGroups: string[];
          };
          vpc: {
            natGateway: string;
            defaultRouteToInternet: boolean;
            interfaceEndpoints: string[];
            gatewayEndpoints: string[];
          };
        };
      };

      const net = sketch._network_configuration_sketch;
      expect(net.awsvpcConfiguration.assignPublicIp).toBe("DISABLED");
      expect(net.awsvpcConfiguration.securityGroups.join(",")).toMatch(
        /no-egress/i,
      );
      expect(net.vpc.natGateway).toBe("ABSENT");
      expect(net.vpc.defaultRouteToInternet).toBe(false);
      expect(net.vpc.interfaceEndpoints).toEqual(
        expect.arrayContaining([
          "ecr.api",
          "ecr.dkr",
          "logs",
          "secretsmanager",
          "sqs",
        ]),
      );
      expect(net.vpc.gatewayEndpoints).toContain("s3");
    });

    it("isolation dry_run asserts outbound sockets fail closed", () => {
      const dryRun = fs.readFileSync(
        path.join(REPO_ROOT, "workers/convert/isolation/dry_run.py"),
        "utf8",
      );
      expect(dryRun).toContain("def _assert_no_egress");
      expect(dryRun).toContain("dry_run_egress=denied");
      expect(dryRun).toContain("socket.create_connection");
      expect(dryRun).toMatch(/dry_run_error=egress_unexpectedly_open/);
    });
  });
});
