import { getConfig } from "../config";
import { findJobsPendingDeletion } from "../jobs/repository";
import { emitRedactedAlert } from "./emit";

export type CleanupBacklogAlert = {
  count: number;
  oldestJobId: string | null;
  ageSeconds: number;
};

/**
 * Alert when verified cleanup lags the SPEC-STORAGE target (default 5 minutes
 * after tombstone / delete request). Redacted: opaque job id + counts only.
 * Lifecycle rules must not silence this alert.
 */
export function evaluateCleanupBacklog(
  now: Date = new Date(),
): CleanupBacklogAlert {
  const thresholdSec = getConfig().cleanupBacklogAlertSeconds;
  const pending = findJobsPendingDeletion();
  let oldestJobId: string | null = null;
  let oldestAge = 0;
  let count = 0;

  for (const job of pending) {
    if (job.state === "deleted") continue;
    const updated = Date.parse(job.updatedAt);
    if (!Number.isFinite(updated)) continue;
    const ageSeconds = Math.floor((now.getTime() - updated) / 1000);
    if (ageSeconds < thresholdSec) continue;
    count += 1;
    if (ageSeconds >= oldestAge) {
      oldestAge = ageSeconds;
      oldestJobId = job.id;
    }
  }

  return { count, oldestJobId, ageSeconds: oldestAge };
}

/** Emit `cleanup_backlog` when any deleting job exceeds the threshold. */
export function emitCleanupBacklogAlert(
  now: Date = new Date(),
): CleanupBacklogAlert {
  const alert = evaluateCleanupBacklog(now);
  if (alert.count > 0) {
    emitRedactedAlert("cleanup_backlog", {
      count: alert.count,
      oldestJobId: alert.oldestJobId,
      ageSeconds: alert.ageSeconds,
      thresholdSeconds: getConfig().cleanupBacklogAlertSeconds,
    });
  }
  return alert;
}
