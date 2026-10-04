import { getConfig } from "../config";
import { InMemoryJobQueue } from "./memory";
import type { JobQueue } from "./types";

export type {
  JobQueue,
  LeasedQueueMessage,
  QueueDepth,
  QueueMessageBody,
} from "./types";
export {
  assertSafeQueuePayload,
  destinationOutputKey,
  MAX_INFRA_RECEIVE_COUNT,
} from "./types";
export { InMemoryJobQueue } from "./memory";
export {
  QUEUE_PURGE_CONTRACT,
  queueTierClean,
} from "./purge-contract";

let queueSingleton: InMemoryJobQueue | null = null;

/**
 * Local-dev queue. Production swap: SQS adapter behind the same JobQueue interface
 * (visibility timeout = lease; DLQ after one infra retry).
 */
export function getJobQueue(): JobQueue {
  if (!queueSingleton) {
    const visibilityMs = getConfig().queueVisibilityTimeoutSeconds * 1000;
    queueSingleton = new InMemoryJobQueue(visibilityMs);
  }
  return queueSingleton;
}

export function getInMemoryJobQueue(): InMemoryJobQueue {
  return getJobQueue() as InMemoryJobQueue;
}

export function resetJobQueueForTests(visibilityTimeoutSeconds?: number): void {
  const seconds =
    visibilityTimeoutSeconds ?? getConfig().queueVisibilityTimeoutSeconds;
  queueSingleton = new InMemoryJobQueue(seconds * 1000);
}
