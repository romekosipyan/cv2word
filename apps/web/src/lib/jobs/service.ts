import { assertCapacityAllowsNewJob } from "../capacity";
import { assertUploadsEnabled } from "../ops/uploads";
import {
  generateId,
  generateJobSecret,
  hashSecret,
} from "../crypto";
import { getConfig } from "../config";
import { ApiError, type ErrorCode } from "../errors";
import { emitCapacityOrQuotaReject, emitEvent } from "../events";
import { log } from "../logging";
import {
  httpStatusForValidation,
  inspectPdfFile,
  pageBucketFor,
  sizeBucketFor,
} from "../pdf/inspect";
import { MAX_UPLOAD_BYTES } from "../pdf/limits";
import {
  destinationOutputKey,
  getJobQueue,
} from "../queue";
import { getObjectStorage } from "../storage/filesystem";
import type { CreateJobResult, JobRecord, UploadAuthorization } from "./types";
import {
  countQuotaJobsSince,
  findActiveJobForSession,
  findJobByIdempotency,
  insertJob,
  oldestQuotaJobCreatedAt,
  updateJob,
} from "./repository";
import { scheduleUserDeletionCleanup } from "./sweeper";

function stageName(state: JobRecord["state"]): string {
  return state;
}

function rebuildUploadAuth(
  job: JobRecord,
  publicBaseUrl: string,
  uploadToken: string,
): UploadAuthorization {
  const storage = getObjectStorage();
  const expiresAt = job.uploadTokenExpiresAt
    ? new Date(job.uploadTokenExpiresAt)
    : new Date(Date.now() + getConfig().uploadTokenTtlSeconds * 1000);
  const objectKey =
    job.originalObjectKey ?? `originals/${job.id}/source.pdf`;
  return storage.createUploadAuthorization({
    jobId: job.id,
    objectKey,
    uploadToken,
    expiresAt,
    publicBaseUrl,
  });
}

export async function createJob(input: {
  sessionId: string;
  idempotencyKey: string;
  publicBaseUrl: string;
}): Promise<CreateJobResult> {
  // US-112: halt new upload auth (including idempotent token re-issue).
  assertUploadsEnabled();
  const config = getConfig();
  const existing = findJobByIdempotency(input.sessionId, input.idempotencyKey);
  if (existing) {
    // Idempotent replay: do not re-issue the raw job bearer secret.
    const uploadToken = generateId(24);
    const uploadExpires = new Date(
      Date.now() + config.uploadTokenTtlSeconds * 1000,
    );
    const upload = rebuildUploadAuth(existing, input.publicBaseUrl, uploadToken);
    upload.expiresAt = uploadExpires.toISOString();
    updateJob(existing.id, {
      uploadTokenHash: hashSecret(uploadToken),
      uploadTokenExpiresAt: upload.expiresAt,
      state: existing.state === "created" ? "uploading" : existing.state,
    });
    const refreshed = findJobByIdempotency(input.sessionId, input.idempotencyKey)!;
    log.info("job_create_idempotent", { jobId: existing.id });
    return {
      job: refreshed,
      secret: "",
      upload,
      reused: true,
    };
  }

  const active = findActiveJobForSession(input.sessionId);
  if (active) {
    // One active job / session — no charge; include retry timing (US-040).
    throw new ApiError("rate_limited", 429, "rate_limited", {
      retryAfterSeconds: config.activeJobRetryAfterSeconds,
    });
  }

  // ADR-007 pending: configurable free quota defaults to 3 / 24h / session.
  const windowMs = config.freeQuotaWindowSeconds * 1000;
  const since = new Date(Date.now() - windowMs).toISOString();
  const used = countQuotaJobsSince(input.sessionId, since);
  if (used >= config.freeQuotaPer24h) {
    const oldest = oldestQuotaJobCreatedAt(input.sessionId, since);
    let retryAfterSeconds = config.freeQuotaWindowSeconds;
    if (oldest) {
      const freesAt = Date.parse(oldest) + windowMs;
      retryAfterSeconds = Math.max(
        1,
        Math.ceil((freesAt - Date.now()) / 1000),
      );
    }
    log.warn("quota_reject", {
      error: "rate_limited",
      used,
      limit: config.freeQuotaPer24h,
      retryAfterSeconds,
    });
    emitCapacityOrQuotaReject("rate_limited");
    throw new ApiError("rate_limited", 429, "rate_limited", {
      retryAfterSeconds,
    });
  }

  // US-041: reject before insert so quota is not charged and no job is created.
  await assertCapacityAllowsNewJob();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.jobAccessTtlSeconds * 1000);
  const uploadExpires = new Date(
    now.getTime() + config.uploadTokenTtlSeconds * 1000,
  );
  const id = generateId(18);
  const secret = generateJobSecret();
  const uploadToken = generateId(24);
  const objectKey = `originals/${id}/source.pdf`;

  const job: JobRecord = {
    id,
    sessionId: input.sessionId,
    tokenHash: hashSecret(secret),
    idempotencyKey: input.idempotencyKey,
    state: "uploading",
    originalObjectKey: objectKey,
    outputObjectKey: null,
    sizeBucket: null,
    pageBucket: null,
    engineVersion: null,
    errorCode: null,
    warningsJson: "[]",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    tombstone: 0,
    quotaCounted: 1,
    uploadTokenHash: hashSecret(uploadToken),
    uploadTokenExpiresAt: uploadExpires.toISOString(),
    leaseToken: null,
    leaseExpiresAt: null,
  };

  insertJob(job);

  const upload = getObjectStorage().createUploadAuthorization({
    jobId: id,
    objectKey,
    uploadToken,
    expiresAt: uploadExpires,
    publicBaseUrl: input.publicBaseUrl,
  });

  log.info("job_created", { jobId: id, state: job.state });

  return { job, secret, upload, reused: false };
}

function failValidation(jobId: string, code: ErrorCode): never {
  updateJob(jobId, {
    state: "failed",
    errorCode: code,
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
  });
  log.info("job_validation_rejected", { jobId, error: code });
  emitEvent("validation_failed", { jobId, error: code });
  throw new ApiError(code, httpStatusForValidation(code));
}

/**
 * Enqueue a job reference only (US-012). Never puts secrets or document bytes
 * on the queue. Idempotent while a live message already exists.
 * Skip terminal / tombstoned jobs so complete-upload replay cannot spawn ghosts.
 */
export async function enqueueJobReference(job: JobRecord): Promise<void> {
  if (job.tombstone === 1) {
    return;
  }
  if (
    job.state === "succeeded" ||
    job.state === "failed" ||
    job.state === "cancelled" ||
    job.state === "deleting" ||
    job.state === "deleted"
  ) {
    return;
  }
  const outputObjectKey =
    job.outputObjectKey ?? destinationOutputKey(job.id);
  if (!job.outputObjectKey) {
    updateJob(job.id, { outputObjectKey });
  }
  await getJobQueue().enqueue({
    jobId: job.id,
    outputObjectKey,
  });
  log.info("job_enqueued", {
    jobId: job.id,
    outputObjectKey,
  });
}

/**
 * Mark upload finished after server-side PDF validation, then enqueue.
 * Validation runs before queue (US-002). Lease/retry = US-012.
 * Conversion (pdf2docx) must not run in this handler.
 */
export async function completeUploadAsync(job: JobRecord): Promise<JobRecord> {
  if (
    job.state === "queued" ||
    job.state === "processing" ||
    job.state === "validating" ||
    job.state === "succeeded"
  ) {
    // Idempotent replay: do not re-count quota; ensure a live queue message.
    await enqueueJobReference(job);
    return job;
  }
  if (job.state === "failed" && job.errorCode) {
    throw new ApiError(
      job.errorCode as ErrorCode,
      httpStatusForValidation(job.errorCode as ErrorCode),
    );
  }
  if (job.state !== "uploading" && job.state !== "created") {
    throw new ApiError("unauthorized", 401);
  }

  // US-112: block new convert enqueue while uploads are shut down.
  assertUploadsEnabled();

  const key = job.originalObjectKey;
  if (!key) {
    failValidation(job.id, "corrupt");
  }

  const storage = getObjectStorage();
  const exists = await storage.objectExists(key);
  if (!exists) {
    failValidation(job.id, "corrupt");
  }

  const size = (await storage.getObjectSize?.(key)) ?? null;
  if (size === null) {
    failValidation(job.id, "corrupt");
  }
  if (size > MAX_UPLOAD_BYTES) {
    failValidation(job.id, "too_large");
  }

  const localPath = storage.getLocalPath?.(key);
  if (!localPath) {
    // Filesystem adapter always provides a path; S3 path would materialize to temp (later).
    failValidation(job.id, "corrupt");
  }

  const inspected = await inspectPdfFile(localPath, size);
  if (!inspected.ok) {
    failValidation(job.id, inspected.error);
  }

  const accessExpires = new Date(
    Date.now() + getConfig().jobAccessTtlSeconds * 1000,
  );
  const outputObjectKey = destinationOutputKey(job.id);
  const updated = updateJob(job.id, {
    state: "queued",
    errorCode: null,
    sizeBucket: sizeBucketFor(inspected.sizeBytes),
    pageBucket: pageBucketFor(inspected.pageCount),
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
    warningsJson: JSON.stringify(inspected.warnings),
    outputObjectKey,
    // Access window restarts at upload-complete (SPEC-STORAGE / US-030).
    expiresAt: accessExpires.toISOString(),
    // Quota was counted once at create; never bump on complete-upload.
  });
  await enqueueJobReference(updated!);
  emitEvent("upload_completed", {
    jobId: job.id,
    pageBucket: updated?.pageBucket ?? undefined,
    sizeBucket: updated?.sizeBucket ?? undefined,
  });
  emitEvent("job_queued", {
    jobId: job.id,
    pageBucket: updated?.pageBucket ?? undefined,
    sizeBucket: updated?.sizeBucket ?? undefined,
  });
  log.info("job_queued", {
    jobId: job.id,
    pageBucket: updated?.pageBucket,
    sizeBucket: updated?.sizeBucket,
  });
  return updated!;
}

export function getJobStatus(job: JobRecord) {
  const warnings = JSON.parse(job.warningsJson || "[]") as string[];
  const downloadAvailable =
    job.state === "succeeded" && Boolean(job.outputObjectKey);
  return {
    id: job.id,
    state: job.state,
    stage: stageName(job.state),
    error: job.errorCode,
    warnings,
    expiresAt: job.expiresAt,
    downloadAvailable,
  };
}

/**
 * User cancel / delete (US-031 / SPEC-STORAGE).
 *
 * 1. Tombstone + revoke access immediately (leases and upload tokens cleared).
 * 2. Workers observing the tombstone must halt and must not publish a result.
 * 3. Physical cleanup is scheduled asynchronously (reuses US-030 reconcile).
 * 4. API/UI must keep reporting `delete_pending` — never claim `deleted`
 *    until verification completes (US-032 owns multi-tier proof).
 *
 * Download alone never calls this path.
 */
export function requestDelete(job: JobRecord): JobRecord {
  if (job.state === "deleted") {
    return job;
  }
  if (job.state === "deleting" || job.tombstone === 1) {
    // Idempotent: access already revoked; nudge cleanup again outside tests.
    scheduleUserDeletionCleanup(job.id);
    return job;
  }
  const priorState = job.state;
  const updated = updateJob(job.id, {
    state: "deleting",
    tombstone: 1,
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
    // Drop worker lease so in-flight converts cannot keep a live capability.
    leaseToken: null,
    leaseExpiresAt: null,
  });
  // Operational metadata only — never filenames, secrets, or resume text.
  log.info("job_delete_pending", { jobId: job.id, priorState });
  emitEvent("delete_requested", { jobId: job.id, priorState });
  scheduleUserDeletionCleanup(job.id);
  return updated!;
}

export async function readDownload(job: JobRecord): Promise<Buffer> {
  if (job.state !== "succeeded" || !job.outputObjectKey) {
    throw new ApiError("unauthorized", 404);
  }
  const bytes = await getObjectStorage().getObject(job.outputObjectKey);
  if (!bytes) {
    throw new ApiError("unauthorized", 404);
  }
  emitEvent("download_requested", {
    jobId: job.id,
    pageBucket: job.pageBucket ?? undefined,
    sizeBucket: job.sizeBucket ?? undefined,
    engineVersion: job.engineVersion ?? undefined,
  });
  return bytes;
}
