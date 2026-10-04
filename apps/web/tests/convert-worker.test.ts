import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { resetDbForTests } from "@/lib/db";
import { runConvertPipeline } from "@/lib/jobs/convert-work";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import { enqueueJobReference } from "@/lib/jobs/service";
import { processOneConvertJob } from "@/lib/jobs/worker-runner";
import {
  destinationOutputKey,
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
const ENGINE_FIXTURES = path.resolve(
  __dirname,
  "../../../workers/convert/tests/fixtures",
);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us010-"));
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

async function complete(id: string, secret: string): Promise<Response> {
  return completeUpload(
    new Request(`${ORIGIN}/api/jobs/${id}/complete-upload`, {
      method: "POST",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function resolvePython(): string {
  if (process.env.CONVERT_PYTHON) return process.env.CONVERT_PYTHON;
  if (process.env.PDF_INSPECT_PYTHON) return process.env.PDF_INSPECT_PYTHON;
  const root = path.resolve(__dirname, "../../..");
  const candidates = [
    path.join(root, "workers", "convert", "spike", ".venv", "Scripts", "python.exe"),
    path.join(root, "workers", "convert", "spike", ".venv", "bin", "python"),
    path.join(root, "workers", "convert", ".venv", "Scripts", "python.exe"),
    path.join(root, "workers", "convert", ".venv", "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "python" : "python3";
}

/** Inflate document.xml and require w:t runs — never print resume text. */
function docxLooksNativeEditable(bytes: Buffer): boolean {
  if (bytes.subarray(0, 2).toString("utf8") !== "PK") return false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rtw-docx-check-"));
  const docxPath = path.join(tmp, "out.docx");
  fs.writeFileSync(docxPath, bytes);
  try {
    const script = `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
xml = z.read("word/document.xml").decode("utf-8", "replace")
sys.exit(0 if "<w:t" in xml else 1)
`;
    execFileSync(resolvePython(), ["-c", script, docxPath], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

describe("US-010 inspect and convert text PDFs", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.WORKER_TEMP_ROOT = path.join(root, "worker-temp");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.CONVERT_WORKER = "0";
    process.env.VITEST = "1";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
  });

  afterEach(() => {
    resetDbForTests();
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows may briefly lock sqlite WAL; temp dirs are disposable.
    }
  });

  it("queued text PDF converts via worker path to native DOCX", async () => {
    const job = await createAuthorizedJob(`us010-ok-${Date.now()}`);
    const pdf = fs.readFileSync(path.join(FIXTURES, "a4_text.pdf"));
    await getObjectStorage().putObject(job.objectKey, pdf);

    const done = await complete(job.id, job.secret);
    expect(done.status).toBe(200);
    expect(findJobById(job.id)!.state).toBe("queued");

    const processed = await processOneConvertJob();
    expect(processed.handled).toBe(true);
    if (!processed.handled) return;
    expect(processed.outcome).toBe("succeeded");

    const final = findJobById(job.id)!;
    expect(final.state).toBe("succeeded");
    expect(final.engineVersion).toBe("pymupdf-1.28.2+pdf2docx-0.5.13");
    expect(final.outputObjectKey).toBe(
      `outputs/${job.id}/resume-editable.docx`,
    );

    const docx = await getObjectStorage().getObject(final.outputObjectKey!);
    expect(docx).not.toBeNull();
    expect(docx!.length).toBeGreaterThan(1000);
    expect(docxLooksNativeEditable(docx!)).toBe(true);
  }, 120_000);

  it("worker re-inspect fails mixed pages with scan_detected", async () => {
    const mixedPath = path.join(ENGINE_FIXTURES, "mixed_pages.pdf");
    expect(fs.existsSync(mixedPath)).toBe(true);

    const job = await createAuthorizedJob(`us010-mixed-${Date.now()}`);
    await getObjectStorage().putObject(
      job.objectKey,
      fs.readFileSync(mixedPath),
    );

    // Bypass complete-upload so the convert worker's re-inspect is exercised.
    updateJob(job.id, {
      state: "queued",
      originalObjectKey: job.objectKey,
      outputObjectKey: destinationOutputKey(job.id),
      sizeBucket: "le_1mib",
      pageBucket: "1_3",
    });
    await enqueueJobReference(findJobById(job.id)!);

    const processed = await processOneConvertJob();
    expect(processed.handled).toBe(true);
    if (!processed.handled) return;
    expect(processed.outcome).toBe("validation_failed");

    const final = findJobById(job.id)!;
    expect(final.state).toBe("failed");
    expect(final.errorCode).toBe("scan_detected");
    expect(
      await getObjectStorage().objectExists(
        `outputs/${job.id}/resume-editable.docx`,
      ),
    ).toBe(false);
  }, 120_000);

  it("image-only fails scan_detected at complete-upload", async () => {
    const job = await createAuthorizedJob(`us010-scan-${Date.now()}`);
    await getObjectStorage().putObject(
      job.objectKey,
      fs.readFileSync(path.join(FIXTURES, "image_only.pdf")),
    );
    const res = await complete(job.id, job.secret);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("scan_detected");
    expect((await processOneConvertJob()).handled).toBe(false);
  });

  it("pipeline CLI path rejects scans without writing DOCX", async () => {
    const tmp = tempDir();
    const out = path.join(tmp, "out.docx");
    try {
      const result = await runConvertPipeline({
        pdfPath: path.join(ENGINE_FIXTURES, "mixed_pages.pdf"),
        docxPath: out,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("scan_detected");
      expect(result.kind).toBe("validation");
      expect(fs.existsSync(out)).toBe(false);
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }, 60_000);

  it("complete-upload does not convert in the request handler", async () => {
    const job = await createAuthorizedJob(`us010-queue-${Date.now()}`);
    await getObjectStorage().putObject(
      job.objectKey,
      fs.readFileSync(path.join(FIXTURES, "letter_text.pdf")),
    );
    const done = await complete(job.id, job.secret);
    expect(done.status).toBe(200);
    const row = findJobById(job.id)!;
    expect(row.state).toBe("queued");
    expect(row.engineVersion).toBeNull();
    expect(
      await getObjectStorage().objectExists(
        `outputs/${job.id}/resume-editable.docx`,
      ),
    ).toBe(false);
  });
});
