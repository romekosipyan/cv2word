import { describe, expect, it } from "vitest";

import { POLL_BACKOFF_MS } from "@/components/converter/pollJob";
import {
  isCancellableStage,
  NAMED_STAGES,
  namedStageForJobState,
} from "@/components/converter/stages";

describe("US-004 named stages", () => {
  it("exposes only the four SPEC-UI stages", () => {
    expect([...NAMED_STAGES]).toEqual([
      "Uploading",
      "Waiting",
      "Converting",
      "Checking output",
    ]);
  });

  it("maps job states to named stages without inventing progress", () => {
    expect(namedStageForJobState("created")).toBe("Uploading");
    expect(namedStageForJobState("uploading")).toBe("Uploading");
    expect(namedStageForJobState("queued")).toBe("Waiting");
    expect(namedStageForJobState("processing")).toBe("Converting");
    expect(namedStageForJobState("validating")).toBe("Checking output");
    expect(namedStageForJobState("succeeded")).toBeNull();
    expect(namedStageForJobState("failed")).toBeNull();
    expect(namedStageForJobState("deleting")).toBeNull();
  });

  it("allows cancel only while waiting or converting", () => {
    expect(isCancellableStage("Waiting")).toBe(true);
    expect(isCancellableStage("Converting")).toBe(true);
    expect(isCancellableStage("Uploading")).toBe(false);
    expect(isCancellableStage("Checking output")).toBe(false);
  });

  it("uses bounded poll backoff instead of a busy spin", () => {
    expect(POLL_BACKOFF_MS[0]).toBeGreaterThanOrEqual(1000);
    expect(POLL_BACKOFF_MS[POLL_BACKOFF_MS.length - 1]).toBeLessThanOrEqual(10_000);
    for (let i = 1; i < POLL_BACKOFF_MS.length; i += 1) {
      expect(POLL_BACKOFF_MS[i]).toBeGreaterThanOrEqual(POLL_BACKOFF_MS[i - 1]);
    }
  });
});
