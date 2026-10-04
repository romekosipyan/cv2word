import { afterEach, describe, expect, it, vi } from "vitest";

import * as jobApi from "@/components/converter/jobApi";
import { JobApiError } from "@/components/converter/jobApi";
import {
  FAILURE_CATALOG_CODES,
  failureForCode,
  messageForErrorCode,
} from "@/components/converter/messages";
import {
  MAX_CONSECUTIVE_TRANSIENT_ERRORS,
  MAX_POLL_WALL_MS,
  POLL_BACKOFF_MS,
  pollJobStatus,
} from "@/components/converter/pollJob";
import { MAX_UPLOAD_BYTES } from "@/lib/pdf/limits";

describe("US-021 failure catalog UI mapping", () => {
  it("maps every Failure Catalog code to a message and next action", () => {
    for (const code of FAILURE_CATALOG_CODES) {
      const view = failureForCode(code);
      expect(view.code).toBe(code);
      expect(view.message.trim().length).toBeGreaterThan(10);
      expect(view.nextAction.trim().length).toBeGreaterThan(5);
      expect(view.title.trim().length).toBeGreaterThan(2);
      expect(view.actionKind).toBeTruthy();
    }
  });

  it("uses one neutral unavailable state for expired and unauthorized", () => {
    const expired = failureForCode("expired");
    const unauthorized = failureForCode("unauthorized");

    expect(expired.variant).toBe("unavailable");
    expect(unauthorized.variant).toBe("unavailable");
    expect(expired.title).toBe(unauthorized.title);
    expect(expired.message).toBe(unauthorized.message);
    expect(expired.nextAction).toBe(unauthorized.nextAction);
    expect(expired.actionKind).toBe("start_fresh");
  });

  it("states lost credentials cannot be recovered by email", () => {
    for (const code of ["expired", "unauthorized"] as const) {
      const view = failureForCode(code);
      expect(view.credentialNote).toBeTruthy();
      expect(view.credentialNote!.toLowerCase()).toMatch(/email/);
      expect(view.credentialNote!.toLowerCase()).toMatch(/cannot be recovered/);
      expect(view.nextAction.toLowerCase()).toMatch(/fresh|new|choose|upload/);
    }
  });

  it("keeps exact limits and avoids forbidden claim language", () => {
    const large = failureForCode("too_large");
    expect(large.message).toContain("10 MiB");
    expect(large.message).toContain(MAX_UPLOAD_BYTES.toLocaleString());

    const pages = failureForCode("too_many_pages");
    expect(pages.message).toContain("5-page");

    const blob = FAILURE_CATALOG_CODES.map((c) => {
      const v = failureForCode(c);
      return `${v.title} ${v.message} ${v.nextAction} ${v.credentialNote ?? ""}`;
    }).join(" ");

    expect(blob.toLowerCase()).not.toMatch(/perfect layout|100%|ats guaranteed/);
    expect(blob.toLowerCase()).not.toMatch(/pixel[- ]identical/);
    expect(blob.toLowerCase()).not.toMatch(/verified deletion|fully deleted/);
    expect(blob).not.toMatch(/%\s*complete|percent/);
  });

  it("includes retry timing for queue_full and rate_limited when provided", () => {
    const queued = failureForCode("queue_full", { retryAfterSeconds: 45 });
    expect(queued.message).toMatch(/45 seconds/);
    expect(queued.nextAction).toMatch(/45 seconds/);

    const limited = failureForCode("rate_limited", { retryAfterSeconds: 120 });
    expect(limited.message).toMatch(/2 minutes/);
  });

  it("keeps messageForErrorCode aligned with failureForCode", () => {
    for (const code of FAILURE_CATALOG_CODES) {
      expect(messageForErrorCode(code)).toBe(failureForCode(code).message);
    }
  });
});

describe("US-021 processing always exits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("bounds poll backoff and wall-clock so the UI cannot spin forever", () => {
    expect(POLL_BACKOFF_MS[0]).toBeGreaterThanOrEqual(1000);
    expect(POLL_BACKOFF_MS[POLL_BACKOFF_MS.length - 1]).toBeLessThanOrEqual(10_000);
    expect(MAX_POLL_WALL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(MAX_POLL_WALL_MS).toBeGreaterThanOrEqual(2 * 60 * 1000);
    expect(MAX_CONSECUTIVE_TRANSIENT_ERRORS).toBeGreaterThanOrEqual(3);
    expect(MAX_CONSECUTIVE_TRANSIENT_ERRORS).toBeLessThanOrEqual(20);
  });

  it("stops polling after consecutive transient errors", async () => {
    vi.useFakeTimers();
    vi.spyOn(jobApi, "getJob").mockRejectedValue(
      new JobApiError("rate_limited", 429, { retryAfterSeconds: 1 }),
    );

    const onError = vi.fn().mockReturnValue({ action: "continue" as const });
    const controller = new AbortController();
    const done = pollJobStatus("job-1", "secret-1", controller.signal, {
      onStatus: () => ({ action: "continue" }),
      onDeletePending: () => ({ action: "continue" }),
      onError,
    });

    for (let i = 0; i < MAX_CONSECUTIVE_TRANSIENT_ERRORS + 2; i += 1) {
      await vi.advanceTimersByTimeAsync(10_000);
    }
    await done;

    expect(onError).toHaveBeenCalled();
    const last = onError.mock.calls.at(-1)?.[0] as JobApiError;
    expect(last).toBeInstanceOf(JobApiError);
    // Budget exhaustion is always a terminal conversion_failed (no spinner).
    expect(last.code).toBe("conversion_failed");
  });

  it("stops with conversion_failed when the wall-clock budget is exhausted", async () => {
    vi.useFakeTimers();
    const started = Date.now();

    vi.spyOn(jobApi, "getJob").mockImplementation(async () => {
      vi.setSystemTime(started + MAX_POLL_WALL_MS + 50);
      return {
        id: "job-1",
        state: "queued",
        expiresAt: new Date(started + 60_000).toISOString(),
      };
    });

    const onError = vi.fn().mockReturnValue({ action: "stop" as const });
    const onStatus = vi.fn().mockReturnValue({ action: "continue", delayMs: 0 });
    const controller = new AbortController();
    const done = pollJobStatus("job-1", "secret-1", controller.signal, {
      onStatus,
      onDeletePending: () => ({ action: "continue" }),
      onError,
    });

    await vi.advanceTimersByTimeAsync(0);
    await done;

    expect(onStatus).toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
    const err = onError.mock.calls[0][0] as JobApiError;
    expect(err.code).toBe("conversion_failed");
  });
});
