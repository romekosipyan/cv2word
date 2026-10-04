import {
  emitCapacityRejectAlert,
  evaluateQueueWaitAlert,
} from "../alerts";
import { getConfig } from "../config";
import { ApiError } from "../errors";
import { emitCapacityOrQuotaReject } from "../events";
import { getJobQueue } from "../queue";
import { decideCapacity, type CapacityDecision } from "./predict";

export {
  decideCapacity,
  predictWaitSeconds,
  type CapacityDecision,
  type CapacitySnapshot,
} from "./predict";

/**
 * Read queue depth + configured ready-worker / p50 placeholders and decide
 * whether a new job may be accepted. Does not invent progress percentages.
 */
export async function evaluateCapacity(): Promise<CapacityDecision> {
  const config = getConfig();
  const depth = await getJobQueue().approximateDepth();
  return decideCapacity({
    queued: depth.queued,
    inFlight: depth.inFlight,
    readyWorkers: config.capacityReadyWorkers,
    p50JobSeconds: config.capacityP50JobSeconds,
    maxWaitSeconds: config.capacityMaxWaitSeconds,
  });
}

/**
 * Reject before insert/quota charge when predicted wait would exceed 2 minutes.
 * Idempotent replays must call this only for new job creation paths.
 */
export async function assertCapacityAllowsNewJob(): Promise<void> {
  const decision = await evaluateCapacity();
  const config = getConfig();
  evaluateQueueWaitAlert(decision.predictedWaitSeconds, {
    depth: decision.depth,
    readyWorkers: config.capacityReadyWorkers,
  });
  if (decision.admit) {
    return;
  }
  emitCapacityRejectAlert({
    predictedWaitSeconds: decision.predictedWaitSeconds,
    depth: decision.depth,
    retryAfterSeconds: decision.retryAfterSeconds,
  });
  emitCapacityOrQuotaReject("queue_full");
  throw new ApiError("queue_full", 503, "queue_full", {
    retryAfterSeconds: decision.retryAfterSeconds,
  });
}
