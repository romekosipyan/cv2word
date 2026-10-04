import {
  getJob,
  JobApiError,
  type JobStatusResponse,
} from "./jobApi";

/** Bounded backoff between polls (SPEC-API). Clients must not spin. */
export const POLL_BACKOFF_MS = [1000, 2000, 3000, 5000, 8000] as const;

/**
 * Hard wall-clock cap so processing always exits (worker ≤120s + one infra retry
 * + bounded queue wait). No indefinite spinner.
 */
export const MAX_POLL_WALL_MS = 6 * 60 * 1000;

/** Consecutive network / transient errors before giving up. */
export const MAX_CONSECUTIVE_TRANSIENT_ERRORS = 8;

export type PollDecision =
  | { action: "continue"; delayMs?: number }
  | { action: "stop" };

export type PollHandlers = {
  onStatus: (status: JobStatusResponse) => PollDecision | void;
  onDeletePending: () => PollDecision | void;
  onError: (err: JobApiError | Error) => PollDecision | void;
};

function nextDelay(attempt: number): number {
  const idx = Math.min(attempt, POLL_BACKOFF_MS.length - 1);
  return POLL_BACKOFF_MS[idx];
}

function isTransientPollError(err: unknown): boolean {
  if (err instanceof JobApiError) {
    return (
      err.code === "rate_limited" ||
      err.code === "queue_full" ||
      err.code === "delete_pending"
    );
  }
  // Network / abort-adjacent fetch failures — keep trying briefly.
  return err instanceof Error && !(err instanceof DOMException);
}

/**
 * Poll GET /api/jobs/{id} with backoff until the caller stops, abort fires,
 * or the wall-clock / transient-error budget is exhausted.
 * Credentials stay in headers/cookies — never the URL.
 */
export async function pollJobStatus(
  jobId: string,
  secret: string,
  signal: AbortSignal,
  handlers: PollHandlers,
): Promise<void> {
  let attempt = 0;
  let consecutiveTransient = 0;
  const startedAt = Date.now();

  while (!signal.aborted) {
    if (Date.now() - startedAt >= MAX_POLL_WALL_MS) {
      handlers.onError(new JobApiError("conversion_failed", 504));
      return;
    }

    try {
      const status = await getJob(jobId, secret, signal);
      consecutiveTransient = 0;
      const decision = handlers.onStatus(status) ?? { action: "continue" as const };
      if (decision.action === "stop") return;
      await sleep(decision.delayMs ?? nextDelay(attempt), signal);
      attempt += 1;
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;

      if (err instanceof JobApiError && err.code === "delete_pending") {
        consecutiveTransient = 0;
        const decision =
          handlers.onDeletePending() ?? { action: "continue" as const };
        if (decision.action === "stop") return;
        await sleep(decision.delayMs ?? nextDelay(attempt), signal);
        attempt += 1;
        continue;
      }

      if (isTransientPollError(err)) {
        consecutiveTransient += 1;
        if (consecutiveTransient >= MAX_CONSECUTIVE_TRANSIENT_ERRORS) {
          // Always terminal — callers may "continue" on rate_limited, which
          // must not leave an indefinite spinner after the budget is spent.
          const giveUp = new JobApiError("conversion_failed", 503);
          handlers.onError(giveUp);
          return;
        }
      } else {
        consecutiveTransient = 0;
      }

      const decision =
        handlers.onError(err instanceof Error ? err : new Error(String(err))) ??
        { action: "stop" as const };
      if (decision.action === "stop") return;
      await sleep(decision.delayMs ?? nextDelay(attempt), signal);
      attempt += 1;
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
