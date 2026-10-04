import { randomBytes } from "node:crypto";
import type { ErrorCode } from "../errors";
import { emitEvent } from "../events";
import { log } from "../logging";
import { findJobById, updateJob } from "./repository";
import type { JobRecord, JobState } from "./types";

export type LeaseAcquireResult =
  | { ok: true; leaseToken: string; job: JobRecord }
  | { ok: false; reason: "not_found" | "tombstone" | "terminal" | "lease_held" };

export type PublishResult =
  | { ok: true; job: JobRecord }
  | {
      ok: false;
      reason: "not_found" | "tombstone" | "lease_invalid" | "lease_expired";
    };

const TERMINAL_FOR_WORKER: ReadonlySet<JobState> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "deleting",
  "deleted",
]);

function leaseStillValid(job: JobRecord, leaseToken: string, now = Date.now()): boolean {
  if (!job.leaseToken || job.leaseToken !== leaseToken) return false;
  if (!job.leaseExpiresAt) return false;
  return new Date(job.leaseExpiresAt).getTime() > now;
}

/**
 * Bind a queue visibility lease to the job row before the worker publishes state.
 * At-least-once redelivery: a new receive may replace an expired lease only.
 */
export function acquireWorkerLease(
  jobId: string,
  leaseExpiresAt: Date,
): LeaseAcquireResult {
  const job = findJobById(jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.tombstone === 1) return { ok: false, reason: "tombstone" };
  if (TERMINAL_FOR_WORKER.has(job.state)) {
    return { ok: false, reason: "terminal" };
  }

  const now = Date.now();
  if (
    job.leaseToken &&
    job.leaseExpiresAt &&
    new Date(job.leaseExpiresAt).getTime() > now
  ) {
    // Another in-flight worker still holds a live lease.
    return { ok: false, reason: "lease_held" };
  }

  const leaseToken = randomBytes(24).toString("base64url");
  const updated = updateJob(jobId, {
    leaseToken,
    leaseExpiresAt: leaseExpiresAt.toISOString(),
    state: job.state === "queued" ? "processing" : job.state,
    outputObjectKey: job.outputObjectKey,
  });
  if (!updated) return { ok: false, reason: "not_found" };

  log.info("job_lease_acquired", { jobId, state: updated.state });
  if (updated.state === "processing") {
    emitEvent("conversion_started", {
      jobId,
      pageBucket: updated.pageBucket ?? undefined,
      sizeBucket: updated.sizeBucket ?? undefined,
    });
  }
  return { ok: true, leaseToken, job: updated };
}

export function clearWorkerLease(
  jobId: string,
  opts?: { requeue?: boolean },
): void {
  updateJob(jobId, {
    leaseToken: null,
    leaseExpiresAt: null,
    state: opts?.requeue ? "queued" : undefined,
  });
}

/**
 * Worker may publish state only with a current lease and no tombstone.
 * Destination output key is sticky: never fork under redelivery.
 */
export function publishWorkerState(
  jobId: string,
  leaseToken: string,
  patch: {
    state?: JobState;
    errorCode?: ErrorCode | null;
    engineVersion?: string | null;
    warningsJson?: string;
    /** When writing output, must match the enqueued destination key. */
    outputObjectKey?: string | null;
  },
): PublishResult {
  const job = findJobById(jobId);
  if (!job) return { ok: false, reason: "not_found" };
  if (job.tombstone === 1) {
    log.info("job_publish_blocked_tombstone", { jobId });
    return { ok: false, reason: "tombstone" };
  }
  if (!leaseStillValid(job, leaseToken)) {
    const expired =
      job.leaseToken === leaseToken &&
      job.leaseExpiresAt &&
      new Date(job.leaseExpiresAt).getTime() <= Date.now();
    return {
      ok: false,
      reason: expired ? "lease_expired" : "lease_invalid",
    };
  }

  if (
    patch.outputObjectKey != null &&
    job.outputObjectKey != null &&
    patch.outputObjectKey !== job.outputObjectKey
  ) {
    // Prevent duplicate/forked outputs under at-least-once delivery.
    log.info("job_publish_blocked_destination", { jobId });
    return { ok: false, reason: "lease_invalid" };
  }

  const clearLease =
    patch.state === "succeeded" ||
    patch.state === "failed" ||
    patch.state === "cancelled";

  const updated = updateJob(jobId, {
    state: patch.state,
    errorCode: patch.errorCode,
    engineVersion: patch.engineVersion,
    warningsJson: patch.warningsJson,
    outputObjectKey:
      patch.outputObjectKey !== undefined
        ? patch.outputObjectKey
        : undefined,
    leaseToken: clearLease ? null : job.leaseToken,
    leaseExpiresAt: clearLease ? null : job.leaseExpiresAt,
  });
  if (!updated) return { ok: false, reason: "not_found" };

  log.info("job_state_published", {
    jobId,
    state: updated.state,
    error: updated.errorCode,
  });
  if (updated.state === "succeeded") {
    emitEvent("output_ready", {
      jobId,
      pageBucket: updated.pageBucket ?? undefined,
      sizeBucket: updated.sizeBucket ?? undefined,
      engineVersion: updated.engineVersion ?? undefined,
    });
  }
  return { ok: true, job: updated };
}
