import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  alertPayloadLooksLeaky,
  beginAlertCapture,
  emitCleanupBacklogAlert,
  emitRedactedAlert,
  endAlertCapture,
  ensureIncidentAlertsInstalled,
  evaluateCleanupBacklog,
  evaluateQueueWaitAlert,
  INCIDENT_ALERT_NAMES,
  observeTelemetryForAlerts,
  recordWorkerCrash,
  resetAlertSinksForTests,
  resetIncidentMetricsForTests,
  resetQueueWaitAlertForTests,
  sanitizeAlertFields,
} from "@/lib/alerts";
import { resetDbForTests } from "@/lib/db";
import {
  emitEvent,
  resetTelemetrySinkForTests,
} from "@/lib/events";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import { processOneSimulatedJob } from "@/lib/jobs/worker-sim";
import { resetJobQueueForTests } from "@/lib/queue";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import {
  getObjectStorage,
  resetObjectStorageForTests,
} from "@/lib/storage/filesystem";
import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";

const ORIGIN = "http://localhost:3000";
const FIXTURES = path.resolve(
  __dirname,
  "../../../workers/convert/inspect/fixtures",
);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us043-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
}

async function createAuthorizedJob(key: string) {
  const res = await createJob(
    new Request(`${ORIGIN}/api/jobs`, {
      method: "POST",
      headers: baseHeaders({
        "idempotency-key": key,
        "content-type": "application/json",
      }),
    }),
  );
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    id: string;
    secret: string;
    upload: { objectKey: string };
  };
  return {
    id: body.id,
    secret: body.secret,
    objectKey: body.upload.objectKey,
  };
}

async function putGoodPdf(objectKey: string) {
  const pdf = fs.readFileSync(path.join(FIXTURES, "a4_text.pdf"));
  await getObjectStorage().putObject(objectKey, pdf);
}

async function complete(id: string, secret: string) {
  return completeUpload(
    new Request(`${ORIGIN}/api/jobs/${id}/complete-upload`, {
      method: "POST",
      headers: baseHeaders({
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      }),
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("US-043 alert field sanitization", () => {
  afterEach(() => {
    resetAlertSinksForTests();
  });

  it("keeps only allowlisted sanitized fields", () => {
    const cleaned = sanitizeAlertFields({
      count: 2,
      oldestJobId: "job-opaque-1",
      error: "conversion_failed",
      engineVersion: "sim-0",
      sizeBucket: "lt_1mb",
      pageBucket: "1_3",
      filename: "resume.pdf",
      secret: "super-secret",
      token: "tok",
      body: "%PDF-1.4 Resume of Alice",
      extractedText: "Resume of Alice",
      authorization: "Bearer xyz",
      unknownKey: "drop-me",
    });
    expect(cleaned).toEqual({
      count: 2,
      oldestJobId: "job-opaque-1",
      error: "conversion_failed",
      engineVersion: "sim-0",
      sizeBucket: "lt_1mb",
      pageBucket: "1_3",
    });
    expect(cleaned).not.toHaveProperty("filename");
    expect(cleaned).not.toHaveProperty("secret");
    expect(JSON.stringify(cleaned)).not.toMatch(/%PDF/);
    expect(JSON.stringify(cleaned)).not.toContain("Resume of");
  });

  it("drops non-catalog error codes and long free text", () => {
    const cleaned = sanitizeAlertFields({
      error: "stack_trace_dump",
      jobId: "a".repeat(100),
      engineVersion: "ok-engine",
    });
    expect(cleaned.error).toBeUndefined();
    expect(cleaned.jobId).toBeUndefined();
    expect(cleaned.engineVersion).toBe("ok-engine");
  });

  it("emitRedactedAlert never logs forbidden material", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    beginAlertCapture();
    const payload = emitRedactedAlert("worker_crash_rate", {
      crashes: 3,
      jobId: "opaque-job",
      filename: "leaky.pdf",
      secret: "nope",
      body: "%PDF-1.4 Resume of Bob",
      token: "abc",
      engineVersion: "sim-0",
      error: "conversion_failed",
    });
    const captured = endAlertCapture();
    expect(captured).toHaveLength(1);
    expect(payload.fields.jobId).toBe("opaque-job");
    expect(payload.fields.engineVersion).toBe("sim-0");
    expect(payload.fields.error).toBe("conversion_failed");
    expect(payload.fields).not.toHaveProperty("filename");
    expect(payload.fields).not.toHaveProperty("secret");
    expect(payload.fields).not.toHaveProperty("body");
    expect(payload.fields).not.toHaveProperty("token");

    const dumped = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toContain("worker_crash_rate");
    expect(dumped).toContain("opaque-job");
    expect(dumped).not.toContain("leaky.pdf");
    expect(dumped).not.toContain("nope");
    expect(dumped).not.toContain("%PDF");
    expect(dumped).not.toContain("Resume of");
    expect(alertPayloadLooksLeaky(dumped)).toBe(false);
    warn.mockRestore();
  });

  it("exposes the four AC alert names plus capacity_reject", () => {
    expect(INCIDENT_ALERT_NAMES).toEqual(
      expect.arrayContaining([
        "worker_crash_rate",
        "cleanup_backlog",
        "queue_wait",
        "conversion_failed_rate",
        "capacity_reject",
      ]),
    );
  });
});

describe("US-043 incident rate + queue wait alerts", () => {
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
    process.env.ALERT_WORKER_CRASH_THRESHOLD_COUNT = "3";
    process.env.ALERT_WORKER_CRASH_WINDOW_SECONDS = "300";
    process.env.ALERT_CONVERSION_FAILED_MIN_SAMPLES = "5";
    process.env.ALERT_CONVERSION_FAILED_RATE_BPS = "5000";
    process.env.ALERT_QUEUE_WAIT_SECONDS = "15";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    resetAlertSinksForTests();
    resetIncidentMetricsForTests();
    resetQueueWaitAlertForTests();
    resetTelemetrySinkForTests();
  });

  afterEach(() => {
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    resetAlertSinksForTests();
    resetIncidentMetricsForTests();
    resetQueueWaitAlertForTests();
    resetTelemetrySinkForTests();
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.ALERT_WORKER_CRASH_THRESHOLD_COUNT;
    delete process.env.ALERT_WORKER_CRASH_WINDOW_SECONDS;
    delete process.env.ALERT_CONVERSION_FAILED_MIN_SAMPLES;
    delete process.env.ALERT_CONVERSION_FAILED_RATE_BPS;
    delete process.env.ALERT_QUEUE_WAIT_SECONDS;
  });

  it("emits worker_crash_rate after threshold crashes with opaque id only", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    beginAlertCapture();
    recordWorkerCrash({ jobId: "crash-1", engineVersion: "sim-0" });
    recordWorkerCrash({ jobId: "crash-2", engineVersion: "sim-0" });
    expect(endAlertCapture()).toHaveLength(0);
    beginAlertCapture();
    recordWorkerCrash({ jobId: "crash-3", engineVersion: "sim-0" });
    const alerts = endAlertCapture();
    expect(alerts.some((a) => a.alert === "worker_crash_rate")).toBe(true);
    const crash = alerts.find((a) => a.alert === "worker_crash_rate")!;
    expect(crash.fields.crashes).toBe(3);
    expect(crash.fields.engineVersion).toBe("sim-0");
    expect(JSON.stringify(crash)).not.toContain("filename");
    expect(JSON.stringify(crash)).not.toMatch(/%PDF/);
    const dumped = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toMatch(/worker_crash_rate/);
    expect(dumped).not.toContain("secret");
    warn.mockRestore();
  });

  it("records worker crash from simulated uncaught work failure", async () => {
    beginAlertCapture();
    const { id, secret, objectKey } = await createAuthorizedJob("us043-crash");
    await putGoodPdf(objectKey);
    expect((await complete(id, secret)).status).toBe(200);

    // Threshold 3 — first crash alone should not alert.
    await processOneSimulatedJob(async () => {
      throw new Error("boom with Resume of Alice and secret=leak");
    });
    const early = endAlertCapture().filter((a) => a.alert === "worker_crash_rate");
    expect(early).toHaveLength(0);

    beginAlertCapture();
    recordWorkerCrash({ jobId: id });
    recordWorkerCrash({ jobId: id });
    const alerts = endAlertCapture().filter((a) => a.alert === "worker_crash_rate");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(alerts)).not.toContain("Resume of");
    expect(JSON.stringify(alerts)).not.toContain("secret=leak");
    expect(JSON.stringify(alerts)).not.toContain(secret);
  });

  it("emits conversion_failed_rate from sanitized telemetry only", () => {
    ensureIncidentAlertsInstalled();
    beginAlertCapture();
    const now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      observeTelemetryForAlerts(
        {
          event: "conversion_started",
          props: { jobId: `j-${i}` },
          at: new Date(now).toISOString(),
        },
        now,
      );
      observeTelemetryForAlerts(
        {
          event: "conversion_failed",
          props: {
            jobId: `j-${i}`,
            error: "output_invalid",
            engineVersion: "sim-0",
          },
          at: new Date(now).toISOString(),
        },
        now,
      );
    }
    // Also prove emitEvent path cannot smuggle filename into alerts.
    emitEvent("conversion_failed", {
      jobId: "j-extra",
      error: "conversion_failed",
      filename: "nope.pdf",
      secret: "nope",
      body: "%PDF-1.4",
    } as Record<string, unknown>);

    const alerts = endAlertCapture().filter(
      (a) => a.alert === "conversion_failed_rate",
    );
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.stringify(alerts);
    expect(payload).toContain("conversion_failed_rate");
    expect(payload).toMatch(/output_invalid|conversion_failed/);
    expect(payload).not.toContain("nope.pdf");
    expect(payload).not.toContain("%PDF");
    expect(payload).not.toContain("filename");
  });

  it("emits queue_wait when predicted wait exceeds threshold", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    beginAlertCapture();
    const result = evaluateQueueWaitAlert(45, {
      depth: 10,
      readyWorkers: 2,
    });
    expect(result.alerted).toBe(true);
    const alerts = endAlertCapture();
    expect(alerts[0]?.alert).toBe("queue_wait");
    expect(alerts[0]?.fields.predictedWaitSeconds).toBe(45);
    expect(alerts[0]?.fields.thresholdSeconds).toBe(15);
    expect(alerts[0]?.fields).not.toHaveProperty("filename");
    const dumped = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toMatch(/queue_wait/);
    expect(dumped).not.toMatch(/%PDF/);
    warn.mockRestore();
  });

  it("cleanup_backlog stays redacted through shared emit path", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us043-bl");
    await putGoodPdf(objectKey);
    const del = await (
      await import("@/app/api/jobs/[id]/route")
    ).DELETE(
      new Request(`${ORIGIN}/api/jobs/${id}`, {
        method: "DELETE",
        headers: baseHeaders({ authorization: `Bearer ${secret}` }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(del.status).toBe(202);
    updateJob(id, {
      updatedAt: new Date(Date.now() - 400_000).toISOString(),
    });
    expect(evaluateCleanupBacklog(new Date()).oldestJobId).toBe(id);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    beginAlertCapture();
    emitCleanupBacklogAlert(new Date());
    const alerts = endAlertCapture();
    expect(alerts.some((a) => a.alert === "cleanup_backlog")).toBe(true);
    const dumped = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toMatch(/cleanup_backlog/);
    expect(dumped).toContain(id);
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toMatch(/%PDF/);
    expect(findJobById(id)?.state).toBe("deleting");
    warn.mockRestore();
  });
});
