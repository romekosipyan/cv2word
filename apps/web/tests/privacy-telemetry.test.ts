import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { DELETE as deleteJob } from "@/app/api/jobs/[id]/route";
import { GET as downloadJob } from "@/app/api/jobs/[id]/download/route";
import { resetDbForTests } from "@/lib/db";
import {
  ESSENTIAL_EVENT_NAMES,
  MARKETING_TELEMETRY_ENABLED,
  beginTelemetryCapture,
  emitCapacityOrQuotaReject,
  emitEvent,
  endTelemetryCapture,
  payloadLooksLeaky,
  registerTelemetryMetricsHook,
  resetTelemetrySinkForTests,
  sanitizeTelemetryProps,
} from "@/lib/events";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import { reconcileUserDeletion } from "@/lib/jobs/sweeper";
import { processOneSimulatedJob } from "@/lib/jobs/worker-sim";
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

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us053-"));
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

describe("US-053 privacy-safe telemetry (essential subset)", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.JOB_SECRET_PEPPER = "test-pepper-us053";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    resetDbForTests();
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    resetTelemetrySinkForTests();
  });

  afterEach(() => {
    resetTelemetrySinkForTests();
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("documents essential allowlist and ADR-008 marketing gate", () => {
    expect(MARKETING_TELEMETRY_ENABLED).toBe(false);
    expect(ESSENTIAL_EVENT_NAMES).toEqual([
      "file_selected",
      "validation_failed",
      "upload_completed",
      "job_queued",
      "conversion_started",
      "conversion_failed",
      "output_ready",
      "download_requested",
      "delete_requested",
      "deletion_completed",
    ]);
    expect(emitEvent("landing_view", { jobId: "x" }).ok).toBe(false);
    expect(emitEvent("quality_feedback", { jobId: "x" }).ok).toBe(false);
    expect(emitEvent("not_a_real_event", {}).ok).toBe(false);
  });

  it("sanitize drops filename, secret, token, text, and raw URL", () => {
    const cleaned = sanitizeTelemetryProps({
      jobId: "job_abc",
      sizeBucket: "le_1mib",
      pageBucket: "1_3",
      error: "scan_detected",
      filename: "Jane_Doe_Resume.pdf",
      secret: "super-secret-bearer",
      token: "upload-token-value",
      resumeText: "Resume of Jane Doe — phone 555-0100",
      text: "leaked body",
      contactEmail: "jane@example.com",
      rawUrl: "https://evil.example/callback?token=abc",
      url: "https://cdn.example/file.pdf",
      acquisition: "google-cpc",
      utm_source: "newsletter",
      engineVersion: "sim-0",
      durationMs: 1234.6,
      unknownExtra: "drop-me",
    } as Record<string, unknown>);

    expect(cleaned).toEqual({
      jobId: "job_abc",
      sizeBucket: "le_1mib",
      pageBucket: "1_3",
      error: "scan_detected",
      engineVersion: "sim-0",
      durationMs: 1235,
    });
    const serialized = JSON.stringify(cleaned);
    expect(payloadLooksLeaky(serialized)).toBe(false);
    expect(serialized).not.toContain("Jane");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("https://");
    expect(serialized).not.toContain("utm");
  });

  it("emitEvent strips injected forbidden keys from log payloads", () => {
    beginTelemetryCapture();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = emitEvent("validation_failed", {
      jobId: "jid-1",
      error: "too_large",
      filename: "secret-resume.pdf",
      secret: "bearer-xyz",
      token: "tok",
      text: "Resume of Alice — alice@example.com",
      url: "https://example.com/r?secret=1",
    } as Record<string, unknown>);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.props).toEqual({ jobId: "jid-1", error: "too_large" });
    const captured = endTelemetryCapture();
    expect(captured).toHaveLength(1);
    expect(captured[0].props).toEqual({ jobId: "jid-1", error: "too_large" });

    const dumped = info.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toMatch(/"message":"telemetry"/);
    expect(dumped).toMatch(/"event":"validation_failed"/);
    expect(dumped).not.toContain("secret-resume");
    expect(dumped).not.toContain("bearer-xyz");
    expect(dumped).not.toContain("alice@example.com");
    expect(dumped).not.toContain("https://");
  });

  it("lifecycle emits essential events without secrets or resume text", async () => {
    beginTelemetryCapture();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { id, secret, objectKey } = await createAuthorizedJob("us053-life");
    await putGoodPdf(objectKey);
    expect((await complete(id, secret)).status).toBe(200);

    const processed = await processOneSimulatedJob(async () => ({ ok: true }));
    expect(processed.handled && processed.outcome).toBe("succeeded");

    const outputKey = destinationOutputKey(id);
    await getObjectStorage().putObject(outputKey, Buffer.from("PK-fake-docx"));
    updateJob(id, { state: "succeeded", outputObjectKey: outputKey });

    const dl = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${id}/download`, {
        headers: baseHeaders({ authorization: `Bearer ${secret}` }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(dl.status).toBe(200);

    expect((await del(id, secret)).status).toBe(202);
    await reconcileUserDeletion(id);
    expect(findJobById(id)?.state).toBe("deleted");

    const events = endTelemetryCapture().map((e) => e.event);
    expect(events).toContain("upload_completed");
    expect(events).toContain("job_queued");
    expect(events).toContain("conversion_started");
    expect(events).toContain("output_ready");
    expect(events).toContain("download_requested");
    expect(events).toContain("delete_requested");
    expect(events).toContain("deletion_completed");

    for (const name of events) {
      expect(ESSENTIAL_EVENT_NAMES).toContain(name);
    }

    const dumped = [...info.mock.calls, ...warn.mock.calls]
      .map((c) => c.map(String).join(" "))
      .join("\n");
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain("Resume of");
    expect(dumped).not.toMatch(/%PDF/);

    const telemetryLines = dumped
      .split("\n")
      .filter((line) => line.includes('"message":"telemetry"'));
    expect(telemetryLines.length).toBeGreaterThan(0);
    for (const line of telemetryLines) {
      expect(line).not.toMatch(/filename/i);
      expect(line).not.toContain(secret);
      expect(payloadLooksLeaky(line)).toBe(false);
    }
  });

  it("capacity and quota rejects map to validation_failed catalog codes", () => {
    beginTelemetryCapture();
    emitEvent("validation_failed", {
      error: "corrupt",
      jobId: "j1",
      filename: "x.pdf",
    } as Record<string, unknown>);
    emitCapacityOrQuotaReject("queue_full");
    emitCapacityOrQuotaReject("rate_limited");

    const captured = endTelemetryCapture();
    expect(captured.map((e) => e.event)).toEqual([
      "validation_failed",
      "validation_failed",
      "validation_failed",
    ]);
    expect(captured.map((e) => e.props.error)).toEqual([
      "corrupt",
      "queue_full",
      "rate_limited",
    ]);
    for (const ev of captured) {
      expect(ev.props).not.toHaveProperty("filename");
      expect(JSON.stringify(ev.props)).not.toContain(".pdf");
    }
  });

  it("US-043 metrics hook stub receives sanitized events only", () => {
    const seen: string[] = [];
    registerTelemetryMetricsHook((ev) => {
      seen.push(JSON.stringify(ev));
    });
    emitEvent("job_queued", {
      jobId: "hook-job",
      pageBucket: "1_3",
      filename: "nope.pdf",
      secret: "nope",
    } as Record<string, unknown>);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("job_queued");
    expect(seen[0]).toContain("hook-job");
    expect(seen[0]).not.toContain("nope");
    expect(seen[0]).not.toContain(".pdf");
  });

  it("conversion_failed emits catalog error without document body", async () => {
    beginTelemetryCapture();
    const { id, secret, objectKey } = await createAuthorizedJob("us053-fail");
    await putGoodPdf(objectKey);
    expect((await complete(id, secret)).status).toBe(200);

    const processed = await processOneSimulatedJob(async () => ({
      ok: false,
      kind: "validation",
      code: "output_invalid",
    }));
    expect(processed.handled && processed.outcome).toBe("validation_failed");

    const failed = endTelemetryCapture().filter(
      (e) => e.event === "conversion_failed",
    );
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed[0].props.error).toBe("output_invalid");
    expect(failed[0].props.jobId).toBe(id);
    expect(JSON.stringify(failed[0].props)).not.toMatch(/%PDF/);
    expect(JSON.stringify(failed[0].props)).not.toContain(secret);
  });
});
