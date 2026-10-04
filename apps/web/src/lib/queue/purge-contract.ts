import type { JobQueue } from "./types";

/**
 * Production SQS purge semantics (US-032 / ADR-002).
 *
 * SQS has no delete-by-message-attribute API. A production adapter behind
 * {@link JobQueue} must still honor purge-by-jobId before `deleted`:
 *
 * 1. Main queue — receive (or admin-list) live messages; for each body.jobId
 *    match, DeleteMessage by receipt handle (and shorten visibility first if
 *    needed so in-flight copies become deletable).
 * 2. DLQ — same filter+delete on the dead-letter queue URL.
 * 3. Re-check {@link JobQueue.hasLiveMessage} / {@link JobQueue.isInDeadLetter};
 *    only then may the sweeper treat the queue tier as clean.
 * 4. Queue retention / redrive policies are a safety net, not proof.
 *
 * {@link InMemoryJobQueue.purgeByJobId} implements this contract synchronously
 * for local-dev and tests. Wire an SQS adapter to the same methods without
 * weakening fail-closed reconcile.
 */
export const QUEUE_PURGE_CONTRACT = {
  name: "sqs-purge-by-job-id",
  safetyNetOnly: ["queue_retention", "redrive_policy", "lifecycle_expire"] as const,
  requiredBeforeDeleted: ["purge_main", "purge_dlq", "verify_empty"] as const,
} as const;

/** Queue + DLQ tier is clean for a job (reconcile gate). */
export function queueTierClean(queue: JobQueue, jobId: string): boolean {
  return !queue.hasLiveMessage(jobId) && !queue.isInDeadLetter(jobId);
}
