import {
  emitCleanupBacklogAlert,
  evaluateIncidentRateAlerts,
  evaluateQueueWaitAlert,
} from "../alerts";
import { evaluateCapacity } from "../capacity";
import { getConfig } from "../config";
import { emitEvent } from "../events";
import { log } from "../logging";
import { getJobQueue } from "../queue";
import {
  purgePhysicalTiers,
  verifyDeletionTiers,
} from "./deletion-reconcile";
import {
  findInFlightConversionJobs,
  findJobById,
  findJobsExpiredBefore,
  findJobsPendingDeletion,
  findJobsWithExpiredLeases,
  updateJob,
} from "./repository";
import type { JobRecord } from "./types";

export type SweeperResult = {
  leasesCleared: number;
  dlqReconciled: number;
  tombstoned: number;
  objectsRemoved: number;
  multipartsAborted: number;
  tempWiped: number;
  queuePurged: number;
  orphansDrained: number;
  markedDeleted: number;
  cleanupBacklog: number;
};

const EMPTY_RESULT: SweeperResult = {
  leasesCleared: 0,
  dlqReconciled: 0,
  tombstoned: 0,
  objectsRemoved: 0,
  multipartsAborted: 0,
  tempWiped: 0,
  queuePurged: 0,
  orphansDrained: 0,
  markedDeleted: 0,
  cleanupBacklog: 0,
};

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function isOrphanJobState(job: JobRecord | null): boolean {
  if (!job) return true;
  if (job.tombstone === 1) return true;
  return (
    job.state === "succeeded" ||
    job.state === "failed" ||
    job.state === "cancelled" ||
    job.state === "deleting" ||
    job.state === "deleted"
  );
}

async function purgeQueueRefs(jobId: string): Promise<number> {
  const queue = getJobQueue();
  const main = await queue.purgeByJobId(jobId);
  const dlq = queue.purgeDeadLetterByJobId(jobId);
  return main + dlq;
}

function tombstoneForExpiry(job: JobRecord, nowIso: string): JobRecord {
  if (job.tombstone === 1 && job.state === "deleting") {
    return job;
  }
  const updated = updateJob(job.id, {
    state: "deleting",
    tombstone: 1,
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: nowIso,
  });
  log.info("job_expiry_tombstone", { jobId: job.id, state: job.state });
  return updated ?? job;
}

type CleanupReason = "expiry_sweep" | "user_delete";

/**
 * Physical cleanup + multi-tier verification (US-032 / Deletion Contract).
 * Marks `deleted` only when DB access revoke, object keys, multipart uploads,
 * temp disks, and queue/DLQ refs all verify clean. Lifecycle is not proof.
 */
async function cleanupJob(
  job: JobRecord,
  nowIso: string,
  stats: SweeperResult,
  reason: CleanupReason = "expiry_sweep",
): Promise<void> {
  const current = findJobById(job.id) ?? job;
  let working = current;
  if (working.state === "deleted") return;

  if (working.tombstone !== 1 || working.state !== "deleting") {
    working = tombstoneForExpiry(working, nowIso);
    stats.tombstoned += 1;
  }

  try {
    const purged = await purgePhysicalTiers(working);
    stats.objectsRemoved += purged.objectsRemoved;
    stats.multipartsAborted += purged.multipartsAborted;
    stats.tempWiped += purged.tempWiped;
    stats.queuePurged += purged.queuePurged;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    if (detail.startsWith("inventory_unimplemented")) {
      // Adapter omitted required purge inventory — never emit deleted.
      log.warn("job_deletion_cleanup_incomplete", {
        jobId: working.id,
        reason,
        remaining: ["multipart_uploads", "temp_disks"],
        detail,
      });
      return;
    }
    throw err;
  }

  // Re-read after purge so key nulling is not assumed before verify.
  working = findJobById(working.id) ?? working;
  const proof = await verifyDeletionTiers(working);

  if (!proof.verified) {
    log.warn("job_deletion_cleanup_incomplete", {
      jobId: working.id,
      reason,
      remaining: proof.remaining,
    });
    return;
  }

  updateJob(working.id, {
    state: "deleted",
    tombstone: 1,
    originalObjectKey: null,
    outputObjectKey: null,
    uploadTokenHash: null,
    uploadTokenExpiresAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: nowIso,
  });
  stats.markedDeleted += 1;
  log.info("deletion_completed", {
    jobId: working.id,
    reason,
    tiers: proof.tiers.map((t) => t.tier),
  });
  emitEvent("deletion_completed", {
    jobId: working.id,
    reason,
  });
}

const inFlightUserCleanup = new Set<string>();

/**
 * Reconcile a user-requested delete (US-031/US-032). Safe to call after
 * tombstone; marks `deleted` only when every inventoried tier verifies clean.
 */
export async function reconcileUserDeletion(jobId: string): Promise<void> {
  if (inFlightUserCleanup.has(jobId)) return;
  inFlightUserCleanup.add(jobId);
  try {
    const job = findJobById(jobId);
    if (!job || job.state === "deleted") return;
    const stats: SweeperResult = { ...EMPTY_RESULT };
    await cleanupJob(job, new Date().toISOString(), stats, "user_delete");
  } finally {
    inFlightUserCleanup.delete(jobId);
  }
}

/** Fire-and-forget cleanup after user DELETE; sweeper remains the safety net. */
export function scheduleUserDeletionCleanup(jobId: string): void {
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    // Tests drive reconcile explicitly so assertions stay deterministic.
    return;
  }
  void reconcileUserDeletion(jobId).catch((err) => {
    log.error("user_deletion_cleanup_failed", {
      jobId,
      error: err instanceof Error ? err.message : "unknown",
    });
  });
}

/**
 * Clear stale worker leases so lease_held cannot strand a job forever after
 * visibility timeout (US-012 warning → US-030).
 */
function reconcileExpiredLeases(nowIso: string, stats: SweeperResult): void {
  for (const job of findJobsWithExpiredLeases(nowIso)) {
    updateJob(job.id, {
      leaseToken: null,
      leaseExpiresAt: null,
      // Return to queued so a future receive can bind a new lease if a message remains.
      state: job.state === "queued" ? "queued" : "queued",
      updatedAt: nowIso,
    });
    stats.leasesCleared += 1;
    log.info("job_lease_expired_cleared", { jobId: job.id });
  }
}

/**
 * processing/validating rows whose queue message hit DLQ cannot progress.
 * Mark conversion_failed (infra exhausted) and clear the lease.
 */
function reconcileDlqInFlight(nowIso: string, stats: SweeperResult): void {
  const queue = getJobQueue();
  for (const job of findInFlightConversionJobs()) {
    const inDlq = queue.isInDeadLetter(job.id);
    const live = queue.hasLiveMessage(job.id);
    if (!inDlq || live) continue;

    updateJob(job.id, {
      state: "failed",
      errorCode: "conversion_failed",
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: nowIso,
    });
    queue.purgeDeadLetterByJobId(job.id);
    stats.dlqReconciled += 1;
    log.info("job_dlq_reconciled", { jobId: job.id, error: "conversion_failed" });
  }
}

/**
 * Drain ghost / orphan queue + DLQ refs after tombstone or terminal
 * (US-012 ghost-message warning).
 */
async function drainOrphanQueueRefs(stats: SweeperResult): Promise<void> {
  const queue = getJobQueue();
  const jobIds = new Set<string>([
    ...queue.listLiveJobIds(),
    ...queue.deadLetterMessages().map((m) => m.jobId),
  ]);

  for (const jobId of jobIds) {
    const job = findJobById(jobId);
    if (!isOrphanJobState(job)) continue;
    const purged = await purgeQueueRefs(jobId);
    if (purged > 0) {
      stats.orphansDrained += purged;
      log.info("job_orphan_queue_drained", { jobId, purged });
    }
  }
}

/**
 * Automatic expiry + deletion reconcile pass (US-030 / US-032 / SPEC-STORAGE).
 * Callable from tests; also driven by the 5-minute interval.
 */
export async function runExpirySweeper(now: Date = new Date()): Promise<SweeperResult> {
  const nowIso = now.toISOString();
  const stats: SweeperResult = { ...EMPTY_RESULT };

  reconcileDlqInFlight(nowIso, stats);
  reconcileExpiredLeases(nowIso, stats);

  const expired = findJobsExpiredBefore(nowIso);
  const pending = findJobsPendingDeletion();
  const seen = new Set<string>();
  const toClean: JobRecord[] = [];
  for (const job of [...expired, ...pending]) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    toClean.push(job);
  }

  for (const job of toClean) {
    await cleanupJob(job, nowIso, stats);
  }

  await drainOrphanQueueRefs(stats);

  const backlog = emitCleanupBacklogAlert(now);
  stats.cleanupBacklog = backlog.count;

  // US-043: re-evaluate rate alerts + queue wait on sweeper cadence.
  evaluateIncidentRateAlerts(now);
  try {
    const capacity = await evaluateCapacity();
    evaluateQueueWaitAlert(capacity.predictedWaitSeconds, {
      depth: capacity.depth,
      readyWorkers: getConfig().capacityReadyWorkers,
      now,
    });
  } catch {
    // Capacity probe must not break deletion reconcile.
  }

  log.info("expiry_sweep_completed", {
    leasesCleared: stats.leasesCleared,
    dlqReconciled: stats.dlqReconciled,
    tombstoned: stats.tombstoned,
    objectsRemoved: stats.objectsRemoved,
    multipartsAborted: stats.multipartsAborted,
    tempWiped: stats.tempWiped,
    queuePurged: stats.queuePurged,
    orphansDrained: stats.orphansDrained,
    markedDeleted: stats.markedDeleted,
    cleanupBacklog: stats.cleanupBacklog,
  });

  return stats;
}

/** Start the ≥5-minute interval sweeper once per process (local-dev / Node runtime). */
export function ensureExpirySweeperStarted(): void {
  if (intervalHandle) return;
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return;
  }
  const ms = Math.max(1, getConfig().expirySweepIntervalSeconds) * 1000;
  intervalHandle = setInterval(() => {
    void runExpirySweeper().catch((err) => {
      log.error("expiry_sweep_failed", {
        error: err instanceof Error ? err.message : "unknown",
      });
    });
  }, ms);
  intervalHandle.unref?.();
  log.info("expiry_sweeper_started", {
    intervalSeconds: getConfig().expirySweepIntervalSeconds,
  });
}

export function stopExpirySweeperForTests(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

