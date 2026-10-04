import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { resetDbForTests } from "@/lib/db";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import { MAX_UPLOAD_BYTES } from "@/lib/pdf/limits";
import { resetObjectStorageForTests, getObjectStorage } from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";
const FIXTURES = path.resolve(
  __dirname,
  "../../../workers/convert/inspect/fixtures",
);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us002-"));
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

async function putFixture(objectKey: string, fixtureName: string): Promise<void> {
  const bytes = fs.readFileSync(path.join(FIXTURES, fixtureName));
  await getObjectStorage().putObject(objectKey, bytes);
}

async function putBytes(objectKey: string, bytes: Buffer): Promise<void> {
  await getObjectStorage().putObject(objectKey, bytes);
}

async function complete(
  id: string,
  secret: string,
): Promise<Response> {
  return completeUpload(
    new Request(`${ORIGIN}/api/jobs/${id}/complete-upload`, {
      method: "POST",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("US-002 server-side PDF validation", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "20";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("accepts A4 text PDF within raster/geometry caps and queues", async () => {
    const job = await createAuthorizedJob("us002-a4");
    await putFixture(job.objectKey, "a4_text.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("queued");
    expect(body.error).toBeNull();
  });

  it("accepts US Letter text PDF within caps", async () => {
    const job = await createAuthorizedJob("us002-letter");
    await putFixture(job.objectKey, "letter_text.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("queued");
  });

  it("rejects files over 10 MiB with too_large before queue", async () => {
    const job = await createAuthorizedJob("us002-oversize");
    const oversize = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x25); // '%' padding
    // Keep a PDF header so size gate (not type) is decisive.
    oversize.write("%PDF-1.4\n", 0, "utf8");
    await putBytes(job.objectKey, oversize);
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("too_large");

    const status = await getJob(
      new Request(`${ORIGIN}/api/jobs/${job.id}`, {
        method: "GET",
        headers: { authorization: `Bearer ${job.secret}` },
      }),
      { params: Promise.resolve({ id: job.id }) },
    );
    const statusBody = await status.json();
    expect(statusBody.state).toBe("failed");
    expect(statusBody.error).toBe("too_large");
  });

  it("rejects zero-page PDFs", async () => {
    const job = await createAuthorizedJob("us002-zero");
    await putFixture(job.objectKey, "zero_pages.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("corrupt");
  });

  it("rejects more than 5 pages with too_many_pages", async () => {
    const job = await createAuthorizedJob("us002-6p");
    await putFixture(job.objectKey, "six_pages.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("too_many_pages");
  });

  it("rejects non-PDF bytes even when stored as source.pdf", async () => {
    const job = await createAuthorizedJob("us002-mime");
    await putFixture(job.objectKey, "not_pdf.bin");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe("unsupported_type");
  });

  it("rejects encrypted PDFs", async () => {
    const job = await createAuthorizedJob("us002-enc");
    await putFixture(job.objectKey, "encrypted.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("encrypted");
  });

  it("rejects image-only / low-density scan PDFs with scan_detected", async () => {
    const job = await createAuthorizedJob("us002-scan");
    await putFixture(job.objectKey, "image_only.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("scan_detected");
  });

  it("rejects corrupt PDF bytes", async () => {
    const job = await createAuthorizedJob("us002-corrupt");
    await putFixture(job.objectKey, "corrupt.pdf");
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("corrupt");
  });

  it("does not enqueue when validation fails (state stays failed)", async () => {
    const job = await createAuthorizedJob("us002-no-queue");
    await putFixture(job.objectKey, "six_pages.pdf");
    await complete(job.id, job.secret);
    const again = await complete(job.id, job.secret);
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe("too_many_pages");
  });
});
