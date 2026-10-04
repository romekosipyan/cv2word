import path from "node:path";
import { MAX_UPLOAD_BYTES } from "./pdf/limits";

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getConfig() {
  const cwd = process.cwd();
  return {
    databasePath:
      process.env.DATABASE_PATH ?? path.join(cwd, ".data", "jobs.sqlite"),
    jobSecretPepper: process.env.JOB_SECRET_PEPPER ?? "dev-only-change-me",
    storageRoot:
      process.env.STORAGE_ROOT ?? path.join(cwd, ".data", "objects"),
    /**
     * Per-job worker temp disk root (tmpfs stand-in). Lifecycle does not cover
     * this tier — US-032 wipe + verify before `deleted`.
     */
    workerTempRoot:
      process.env.WORKER_TEMP_ROOT ?? path.join(cwd, ".data", "worker-temp"),
    uploadTokenTtlSeconds: intEnv("UPLOAD_TOKEN_TTL_SECONDS", 900),
    /** Access window: 60m after create (abandoned) or after upload completes. */
    jobAccessTtlSeconds: intEnv("JOB_ACCESS_TTL_SECONDS", 3600),
    /** Automatic expiry sweeper cadence (SPEC-STORAGE: at least every 5 minutes). */
    expirySweepIntervalSeconds: intEnv("EXPIRY_SWEEP_INTERVAL_SECONDS", 300),
    /**
     * Cleanup backlog alert threshold (SPEC-STORAGE: verified cleanup target
     * within 5 minutes of user delete / cancel). Not a lifecycle substitute.
     */
    cleanupBacklogAlertSeconds: intEnv("CLEANUP_BACKLOG_ALERT_SECONDS", 300),
    /**
     * US-043 redacted incident alert thresholds (in-process + ops wiring).
     * CloudWatch / SNS provisioning is documented in infra/README — not claimed here.
     */
    alertWorkerCrashWindowSeconds: intEnv(
      "ALERT_WORKER_CRASH_WINDOW_SECONDS",
      300,
    ),
    alertWorkerCrashThresholdCount: intEnv(
      "ALERT_WORKER_CRASH_THRESHOLD_COUNT",
      3,
    ),
    alertConversionFailedWindowSeconds: intEnv(
      "ALERT_CONVERSION_FAILED_WINDOW_SECONDS",
      300,
    ),
    alertConversionFailedMinSamples: intEnv(
      "ALERT_CONVERSION_FAILED_MIN_SAMPLES",
      5,
    ),
    /** Basis points: 5000 = 50% conversion_failed rate. */
    alertConversionFailedRateBps: intEnv(
      "ALERT_CONVERSION_FAILED_RATE_BPS",
      5000,
    ),
    /** Reliability Targets planning p95 queue wait (seconds). */
    alertQueueWaitSeconds: intEnv("ALERT_QUEUE_WAIT_SECONDS", 15),
    /**
     * Free anonymous quota (US-040 / ADR-007 pending product confirmation).
     * Defaults: 3 logical jobs / 24h / session. Configurable; not paid billing.
     */
    freeQuotaPer24h: intEnv("FREE_QUOTA_PER_24H", 3),
    freeQuotaWindowSeconds: intEnv("FREE_QUOTA_WINDOW_SECONDS", 24 * 60 * 60),
    /**
     * Request rate limits (US-040). Keyed by hashed client address (+ job id
     * for poll/download). Cookie rotation alone must not bypass create abuse caps.
     */
    rateLimitCreateMax: intEnv("RATE_LIMIT_CREATE_MAX", 10),
    rateLimitCreateWindowSeconds: intEnv("RATE_LIMIT_CREATE_WINDOW_SECONDS", 60),
    rateLimitPollMax: intEnv("RATE_LIMIT_POLL_MAX", 60),
    rateLimitPollWindowSeconds: intEnv("RATE_LIMIT_POLL_WINDOW_SECONDS", 60),
    rateLimitDownloadMax: intEnv("RATE_LIMIT_DOWNLOAD_MAX", 20),
    rateLimitDownloadWindowSeconds: intEnv(
      "RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS",
      60,
    ),
    /** Retry hint when one-active-job blocks create. */
    activeJobRetryAfterSeconds: intEnv("ACTIVE_JOB_RETRY_AFTER_SECONDS", 30),
    /** SQS visibility timeout stand-in; equals worker lease length. */
    queueVisibilityTimeoutSeconds: intEnv(
      "QUEUE_VISIBILITY_TIMEOUT_SECONDS",
      120,
    ),
    /**
     * Capacity reject (US-041 / ADR-002). p50 is a configurable placeholder,
     * not measured latency truth — see Reliability Targets / US-092.
     */
    capacityMaxWaitSeconds: intEnv("CAPACITY_MAX_WAIT_SECONDS", 120),
    capacityReadyWorkers: intEnv("CAPACITY_READY_WORKERS", 10),
    capacityP50JobSeconds: intEnv("CAPACITY_P50_JOB_SECONDS", 30),
    /**
     * US-112 feature shutdown: when true, reject new upload intake
     * (`POST /api/jobs` and incomplete complete-upload). Sweeper + DELETE
     * must keep running — see vault Rollback and ops runbook.
     */
    uploadsDisabled:
      (process.env.UPLOADS_DISABLED ?? "false").toLowerCase() === "true",
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    cookieSecure: (process.env.COOKIE_SECURE ?? "false").toLowerCase() === "true",
    maxUploadBytes: MAX_UPLOAD_BYTES,
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
