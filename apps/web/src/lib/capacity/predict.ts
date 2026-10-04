/**
 * Capacity admission (US-041 / ADR-002).
 *
 * predicted_wait ≈ (queued + in_flight) × p50_job_seconds / max(ready_workers, 1)
 *
 * CAPACITY_P50_JOB_SECONDS is a configurable placeholder, not measured truth
 * (see Reliability Targets / US-092). Reject when predicted wait would exceed
 * CAPACITY_MAX_WAIT_SECONDS (default 120).
 */

export type CapacitySnapshot = {
  queued: number;
  inFlight: number;
  readyWorkers: number;
  p50JobSeconds: number;
  maxWaitSeconds: number;
};

export type CapacityDecision = {
  admit: boolean;
  predictedWaitSeconds: number;
  /** Hint for Retry-After / client copy; not a measured SLA. */
  retryAfterSeconds: number;
  depth: number;
};

export function predictWaitSeconds(input: {
  queued: number;
  inFlight: number;
  readyWorkers: number;
  p50JobSeconds: number;
}): number {
  const depth = Math.max(0, input.queued) + Math.max(0, input.inFlight);
  const workers = Math.max(1, input.readyWorkers);
  const p50 = Math.max(1, input.p50JobSeconds);
  return (depth * p50) / workers;
}

export function decideCapacity(snapshot: CapacitySnapshot): CapacityDecision {
  const depth =
    Math.max(0, snapshot.queued) + Math.max(0, snapshot.inFlight);
  const predictedWaitSeconds = predictWaitSeconds({
    queued: snapshot.queued,
    inFlight: snapshot.inFlight,
    readyWorkers: snapshot.readyWorkers,
    p50JobSeconds: snapshot.p50JobSeconds,
  });
  const maxWait = Math.max(1, snapshot.maxWaitSeconds);
  const p50 = Math.max(1, snapshot.p50JobSeconds);
  const admit = predictedWaitSeconds <= maxWait;
  // Placeholder retry hint: one p50 slot, bounded by the 2-minute reject window.
  const retryAfterSeconds = Math.min(maxWait, Math.max(p50, 30));
  return {
    admit,
    predictedWaitSeconds,
    retryAfterSeconds,
    depth,
  };
}
