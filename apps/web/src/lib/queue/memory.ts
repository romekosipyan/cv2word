import { randomBytes } from "node:crypto";
import {
  assertSafeQueuePayload,
  MAX_INFRA_RECEIVE_COUNT,
  type JobQueue,
  type LeasedQueueMessage,
  type QueueMessageBody,
} from "./types";

type InternalMessage = {
  id: string;
  body: QueueMessageBody;
  visibleAtMs: number;
  receiveCount: number;
  receiptHandle: string | null;
  deleted: boolean;
};

/**
 * In-process queue for local-dev and tests.
 * Mirrors SQS standard: at-least-once, visibility timeout = lease, DLQ after max receives.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly messages: InternalMessage[] = [];
  private readonly dlq: QueueMessageBody[] = [];

  constructor(
    private readonly visibilityTimeoutMs = 120_000,
    private readonly maxReceiveCount = MAX_INFRA_RECEIVE_COUNT,
  ) {}

  async enqueue(body: QueueMessageBody): Promise<void> {
    assertSafeQueuePayload(body);
    const live = this.messages.find(
      (m) => m.body.jobId === body.jobId && !m.deleted,
    );
    if (live) {
      // One logical job → one live queue message (complete-upload / retry safe).
      return;
    }
    this.messages.push({
      id: randomBytes(12).toString("base64url"),
      body: { jobId: body.jobId, outputObjectKey: body.outputObjectKey },
      visibleAtMs: Date.now(),
      receiveCount: 0,
      receiptHandle: null,
      deleted: false,
    });
  }

  async receive(maxMessages = 1): Promise<LeasedQueueMessage[]> {
    const now = Date.now();
    const out: LeasedQueueMessage[] = [];
    const limit = Math.max(1, Math.min(maxMessages, 10));

    for (const msg of this.messages) {
      if (out.length >= limit) break;
      if (msg.deleted) continue;
      if (msg.visibleAtMs > now) continue;

      msg.receiveCount += 1;
      if (msg.receiveCount > this.maxReceiveCount) {
        msg.deleted = true;
        this.dlq.push({ ...msg.body });
        continue;
      }

      const receiptHandle = randomBytes(16).toString("base64url");
      msg.receiptHandle = receiptHandle;
      msg.visibleAtMs = now + this.visibilityTimeoutMs;
      out.push({
        body: { ...msg.body },
        receiptHandle,
        leaseExpiresAt: new Date(msg.visibleAtMs),
        approximateReceiveCount: msg.receiveCount,
      });
    }
    return out;
  }

  async delete(receiptHandle: string): Promise<void> {
    const msg = this.messages.find(
      (m) => m.receiptHandle === receiptHandle && !m.deleted,
    );
    if (!msg) return;
    msg.deleted = true;
    msg.receiptHandle = null;
  }

  async release(receiptHandle: string): Promise<void> {
    const msg = this.messages.find(
      (m) => m.receiptHandle === receiptHandle && !m.deleted,
    );
    if (!msg) return;
    msg.receiptHandle = null;
    msg.visibleAtMs = Date.now();
  }

  deadLetterMessages(): QueueMessageBody[] {
    return this.dlq.map((m) => ({ ...m }));
  }

  async purgeByJobId(jobId: string): Promise<number> {
    let n = 0;
    for (const msg of this.messages) {
      if (msg.deleted) continue;
      if (msg.body.jobId !== jobId) continue;
      msg.deleted = true;
      msg.receiptHandle = null;
      n += 1;
    }
    return n;
  }

  purgeDeadLetterByJobId(jobId: string): number {
    const before = this.dlq.length;
    const kept = this.dlq.filter((m) => m.jobId !== jobId);
    this.dlq.length = 0;
    this.dlq.push(...kept);
    return before - kept.length;
  }

  hasLiveMessage(jobId: string): boolean {
    return this.messages.some((m) => !m.deleted && m.body.jobId === jobId);
  }

  isInDeadLetter(jobId: string): boolean {
    return this.dlq.some((m) => m.jobId === jobId);
  }

  /** Test helper: force visibility expiry for an in-flight receipt. */
  expireVisibility(receiptHandle: string): void {
    const msg = this.messages.find(
      (m) => m.receiptHandle === receiptHandle && !m.deleted,
    );
    if (!msg) return;
    msg.visibleAtMs = Date.now() - 1;
    msg.receiptHandle = null;
  }

  /** Test helper: move a live message straight to the DLQ. */
  forceDeadLetter(jobId: string): boolean {
    const msg = this.messages.find(
      (m) => !m.deleted && m.body.jobId === jobId,
    );
    if (!msg) return false;
    msg.deleted = true;
    msg.receiptHandle = null;
    this.dlq.push({ ...msg.body });
    return true;
  }

  pendingCount(): number {
    return this.messages.filter((m) => !m.deleted && m.visibleAtMs <= Date.now())
      .length;
  }

  inFlightCount(): number {
    return this.messages.filter(
      (m) => !m.deleted && m.receiptHandle !== null && m.visibleAtMs > Date.now(),
    ).length;
  }

  async approximateDepth(): Promise<{ queued: number; inFlight: number }> {
    const now = Date.now();
    let queued = 0;
    let inFlight = 0;
    for (const m of this.messages) {
      if (m.deleted) continue;
      if (m.receiptHandle !== null && m.visibleAtMs > now) {
        inFlight += 1;
      } else {
        queued += 1;
      }
    }
    return { queued, inFlight };
  }

  /** All non-deleted main-queue job ids (for orphan drain). */
  listLiveJobIds(): string[] {
    return this.messages.filter((m) => !m.deleted).map((m) => m.body.jobId);
  }

  /** Test helper: enqueue N synthetic visible messages (unique job ids). */
  seedVisibleMessages(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const jobId = `capacity-seed-${randomBytes(8).toString("hex")}`;
      this.messages.push({
        id: randomBytes(12).toString("base64url"),
        body: {
          jobId,
          outputObjectKey: `outputs/${jobId}/resume-editable.docx`,
        },
        visibleAtMs: Date.now(),
        receiveCount: 0,
        receiptHandle: null,
        deleted: false,
      });
    }
  }
}
