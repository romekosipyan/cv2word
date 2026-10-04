import { getConfig } from "../config";
import { emitRedactedAlert } from "./emit";

let lastQueueWaitAlertAt = 0;
const ALERT_COOLDOWN_MS = 60_000;

export function resetQueueWaitAlertForTests(): void {
  lastQueueWaitAlertAt = 0;
}

/**
 * Alert when predicted queue wait exceeds the Reliability Targets planning
 * threshold (default 15s). Does not invent progress percentages.
 */
export function evaluateQueueWaitAlert(
  predictedWaitSeconds: number,
  opts?: {
    depth?: number;
    readyWorkers?: number;
    now?: Date;
  },
): { alerted: boolean; predictedWaitSeconds: number } {
  const config = getConfig();
  const threshold = config.alertQueueWaitSeconds;
  const wait = Math.max(0, predictedWaitSeconds);
  if (wait <= threshold) {
    return { alerted: false, predictedWaitSeconds: wait };
  }
  const now = opts?.now ?? new Date();
  if (now.getTime() - lastQueueWaitAlertAt < ALERT_COOLDOWN_MS) {
    return { alerted: false, predictedWaitSeconds: wait };
  }
  lastQueueWaitAlertAt = now.getTime();
  emitRedactedAlert("queue_wait", {
    predictedWaitSeconds: Math.ceil(wait),
    thresholdSeconds: threshold,
    depth: opts?.depth,
    readyWorkers: opts?.readyWorkers,
  });
  return { alerted: true, predictedWaitSeconds: wait };
}

/** Emit capacity_reject via the redacted path (queue_full only). */
export function emitCapacityRejectAlert(input: {
  predictedWaitSeconds: number;
  depth: number;
  retryAfterSeconds: number;
}): void {
  emitRedactedAlert("capacity_reject", {
    error: "queue_full",
    predictedWaitSeconds: Math.ceil(input.predictedWaitSeconds),
    depth: input.depth,
    retryAfterSeconds: input.retryAfterSeconds,
  });
}
