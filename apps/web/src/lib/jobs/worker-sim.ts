import { recordWorkerCrash } from "../alerts";
import type { ErrorCode } from "../errors";
import { emitEvent } from "../events";
import { log } from "../logging";
import {
  getJobQueue,
  MAX_INFRA_RECEIVE_COUNT,
  type LeasedQueueMessage,
} from "../queue";
import {
  acquireWorkerLease,
  clearWorkerLease,
  publishWorkerState,
} from "./lease";
import { findJobById } from "./repository";
import type { JobRecord } from "./types";

export type WorkerFailureKind = "infra" | "validation";

export type SimulatedWorkResult =
  | { ok: true; engineVersion?: string; warnings?: string[] }
  | { ok: false; kind: WorkerFailureKind; code: ErrorCode };

export type ProcessOneResult =
  | { handled: false; reason: "empty" }
  | {
      handled: true;
      jobId: string;
      outcome:
        | "succeeded"
        | "validation_failed"
        | "infra_retry_scheduled"
        | "infra_exhausted"
        | "skipped_tombstone"
        | "skipped_terminal"
        | "skipped_lease_held"
        | "publish_blocked";
      job?: JobRecord;
      receiveCount?: number;
    };

/**
 * Queue lease loop for convert workers. Callers supply work (US-012 sim or
 * US-010 `convertLeasedJob`). Exercises lease, tombstone, and
 * infra-vs-validation retry rules.
 */
export async function processOneSimulatedJob(
  work: (ctx: {
    job: JobRecord;
    message: LeasedQueueMessage;
  }) => Promise<SimulatedWorkResult>,
): Promise<ProcessOneResult> {
  const queue = getJobQueue();
  const [message] = await queue.receive(1);
  if (!message) {
    return { handled: false, reason: "empty" };
  }

  const jobId = message.body.jobId;
  const acquire = acquireWorkerLease(jobId, message.leaseExpiresAt);
  if (!acquire.ok) {
    if (acquire.reason === "tombstone") {
      await queue.delete(message.receiptHandle);
      return {
        handled: true,
        jobId,
        outcome: "skipped_tombstone",
        receiveCount: message.approximateReceiveCount,
      };
    }
    if (acquire.reason === "terminal") {
      await queue.delete(message.receiptHandle);
      return {
        handled: true,
        jobId,
        outcome: "skipped_terminal",
        receiveCount: message.approximateReceiveCount,
      };
    }
    if (acquire.reason === "lease_held") {
      // Leave message invisible; another worker owns the lease.
      return {
        handled: true,
        jobId,
        outcome: "skipped_lease_held",
        receiveCount: message.approximateReceiveCount,
      };
    }
    await queue.delete(message.receiptHandle);
    return {
      handled: true,
      jobId,
      outcome: "publish_blocked",
      receiveCount: message.approximateReceiveCount,
    };
  }

  const { leaseToken, job } = acquire;

  // Ensure sticky destination key from the queue message.
  if (
    !job.outputObjectKey ||
    job.outputObjectKey !== message.body.outputObjectKey
  ) {
    const pinned = publishWorkerState(jobId, leaseToken, {
      outputObjectKey: message.body.outputObjectKey,
      state: "processing",
    });
    if (!pinned.ok) {
      clearWorkerLease(jobId);
      await queue.delete(message.receiptHandle);
      return {
        handled: true,
        jobId,
        outcome: "publish_blocked",
        receiveCount: message.approximateReceiveCount,
      };
    }
  }

  const validating = publishWorkerState(jobId, leaseToken, {
    state: "validating",
  });
  if (!validating.ok) {
    clearWorkerLease(jobId);
    if (validating.reason === "tombstone") {
      await queue.delete(message.receiptHandle);
      return {
        handled: true,
        jobId,
        outcome: "skipped_tombstone",
        receiveCount: message.approximateReceiveCount,
      };
    }
    return {
      handled: true,
      jobId,
      outcome: "publish_blocked",
      receiveCount: message.approximateReceiveCount,
    };
  }

  const current = findJobById(jobId)!;
  let result: SimulatedWorkResult;
  try {
    result = await work({ job: current, message });
  } catch {
    recordWorkerCrash({ jobId, engineVersion: "sim-0" });
    result = { ok: false, kind: "infra", code: "conversion_failed" };
  }

  if (result.ok) {
    const published = publishWorkerState(jobId, leaseToken, {
      state: "succeeded",
      errorCode: null,
      outputObjectKey: message.body.outputObjectKey,
      engineVersion: result.engineVersion ?? "sim-0",
      warningsJson:
        result.warnings !== undefined
          ? JSON.stringify(result.warnings)
          : undefined,
    });
    if (!published.ok) {
      clearWorkerLease(jobId);
      // Cancel/delete won: drop the queue ref and do not publish a result.
      if (published.reason === "tombstone") {
        await queue.delete(message.receiptHandle);
        return {
          handled: true,
          jobId,
          outcome: "skipped_tombstone",
          receiveCount: message.approximateReceiveCount,
        };
      }
      return {
        handled: true,
        jobId,
        outcome: "publish_blocked",
        receiveCount: message.approximateReceiveCount,
      };
    }
    await queue.delete(message.receiptHandle);
    return {
      handled: true,
      jobId,
      outcome: "succeeded",
      job: published.job,
      receiveCount: message.approximateReceiveCount,
    };
  }

  if (result.kind === "validation") {
    // Validation failures must not be retried as infrastructure.
    const published = publishWorkerState(jobId, leaseToken, {
      state: "failed",
      errorCode: result.code,
      outputObjectKey: message.body.outputObjectKey,
    });
    await queue.delete(message.receiptHandle);
    if (!published.ok && published.reason === "tombstone") {
      return {
        handled: true,
        jobId,
        outcome: "skipped_tombstone",
        receiveCount: message.approximateReceiveCount,
      };
    }
    log.info("job_validation_terminal", {
      jobId,
      error: result.code,
      receiveCount: message.approximateReceiveCount,
    });
    emitEvent("conversion_failed", {
      jobId,
      error: result.code,
      pageBucket: (published.ok ? published.job : findJobById(jobId))?.pageBucket ?? undefined,
      sizeBucket: (published.ok ? published.job : findJobById(jobId))?.sizeBucket ?? undefined,
    });
    return {
      handled: true,
      jobId,
      outcome: "validation_failed",
      job: published.ok ? published.job : findJobById(jobId) ?? undefined,
      receiveCount: message.approximateReceiveCount,
    };
  }

  // Infrastructure failure: retry once (receiveCount 1 → release; >= max → fail).
  if (message.approximateReceiveCount < MAX_INFRA_RECEIVE_COUNT) {
    clearWorkerLease(jobId, { requeue: true });
    await queue.release(message.receiptHandle);
    log.info("job_infra_retry_scheduled", {
      jobId,
      receiveCount: message.approximateReceiveCount,
    });
    return {
      handled: true,
      jobId,
      outcome: "infra_retry_scheduled",
      job: findJobById(jobId) ?? undefined,
      receiveCount: message.approximateReceiveCount,
    };
  }

  const published = publishWorkerState(jobId, leaseToken, {
    state: "failed",
    errorCode: "conversion_failed",
    outputObjectKey: message.body.outputObjectKey,
  });
  await queue.delete(message.receiptHandle);
  log.info("job_infra_exhausted", {
    jobId,
    receiveCount: message.approximateReceiveCount,
  });
  emitEvent("conversion_failed", {
    jobId,
    error: "conversion_failed",
    pageBucket: (published.ok ? published.job : findJobById(jobId))?.pageBucket ?? undefined,
    sizeBucket: (published.ok ? published.job : findJobById(jobId))?.sizeBucket ?? undefined,
  });
  return {
    handled: true,
    jobId,
    outcome: "infra_exhausted",
    job: published.ok ? published.job : findJobById(jobId) ?? undefined,
    receiveCount: message.approximateReceiveCount,
  };
}
