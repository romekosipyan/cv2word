/**
 * SQS-shaped queue contract (ADR-002).
 * Visibility timeout = lease. Messages carry job references only.
 */

/** Wire payload: never document bytes, bearer secrets, or upload tokens. */
export interface QueueMessageBody {
  jobId: string;
  /** Deterministic output key so at-least-once redelivery cannot fork outputs. */
  outputObjectKey: string;
}

export interface LeasedQueueMessage {
  body: QueueMessageBody;
  receiptHandle: string;
  leaseExpiresAt: Date;
  /** SQS ApproximateReceiveCount; first delivery = 1. */
  approximateReceiveCount: number;
}

export type QueueDepth = {
  /** Visible / ApproximateNumberOfMessages stand-in. */
  queued: number;
  /** In-flight / ApproximateNumberOfMessagesNotVisible stand-in. */
  inFlight: number;
};

export interface JobQueue {
  /** Idempotent for the same jobId while a live message exists. */
  enqueue(body: QueueMessageBody): Promise<void>;

  receive(maxMessages?: number): Promise<LeasedQueueMessage[]>;

  /** Ack — remove from queue after successful terminal handling. */
  delete(receiptHandle: string): Promise<void>;

  /**
   * Make the message visible again immediately (infra nack).
   * Production maps to ending the visibility timeout early.
   */
  release(receiptHandle: string): Promise<void>;

  /** Messages that exceeded maxReceiveCount (DLQ stand-in for local-dev). */
  deadLetterMessages(): QueueMessageBody[];

  /**
   * Approximate depth for capacity admission (US-041).
   * Production maps to SQS ApproximateNumberOfMessages(+NotVisible).
   */
  approximateDepth(): Promise<QueueDepth>;

  /**
   * Soft-delete every live main-queue message for a job (expiry / tombstone).
   * Production SQS: filter+DeleteMessage by body.jobId — see purge-contract.ts.
   * Queue retention is not proof of deletion (US-032).
   */
  purgeByJobId(jobId: string): Promise<number>;

  /**
   * Drop dead-letter entries for a job after reconcile.
   * Production SQS: same filter+delete on the DLQ URL (purge-contract.ts).
   */
  purgeDeadLetterByJobId(jobId: string): number;

  /** True when a non-deleted main-queue message still exists (in-flight or pending). */
  hasLiveMessage(jobId: string): boolean;

  /** True when the job reference sits in the DLQ. */
  isInDeadLetter(jobId: string): boolean;

  /** Job ids with a live (non-deleted) main-queue message — for orphan drain. */
  listLiveJobIds(): string[];
}

/** Initial delivery + one infra retry, then DLQ (ADR-002 / SPEC-WORKER). */
export const MAX_INFRA_RECEIVE_COUNT = 2;

export function destinationOutputKey(jobId: string): string {
  return `outputs/${jobId}/resume-editable.docx`;
}

/** Reject payloads that would violate the privacy contract. */
export function assertSafeQueuePayload(body: unknown): asserts body is QueueMessageBody {
  if (!body || typeof body !== "object") {
    throw new Error("invalid_queue_payload");
  }
  const o = body as Record<string, unknown>;
  const allowed = new Set(["jobId", "outputObjectKey"]);
  for (const key of Object.keys(o)) {
    if (!allowed.has(key)) {
      throw new Error(`forbidden_queue_field:${key}`);
    }
  }
  if (typeof o.jobId !== "string" || !o.jobId) {
    throw new Error("invalid_queue_job_id");
  }
  if (typeof o.outputObjectKey !== "string" || !o.outputObjectKey) {
    throw new Error("invalid_queue_output_key");
  }
  const blob = JSON.stringify(o);
  const forbidden = [
    "secret",
    "token",
    "authorization",
    "bearer",
    "pdf",
    "bytes",
    "content",
    "resumeText",
  ];
  for (const f of forbidden) {
    if (Object.prototype.hasOwnProperty.call(o, f)) {
      throw new Error(`forbidden_queue_field:${f}`);
    }
  }
  // Coarse guard: payload must stay tiny reference-only JSON.
  if (blob.length > 512) {
    throw new Error("queue_payload_too_large");
  }
}
