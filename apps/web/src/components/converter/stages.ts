/** User-visible processing stages (SPEC-UI). Never invent percentages. */
export const NAMED_STAGES = [
  "Uploading",
  "Waiting",
  "Converting",
  "Checking output",
] as const;

export type NamedStage = (typeof NAMED_STAGES)[number];

/**
 * Map canonical job states to the four named UI stages.
 * Terminal / deletion states return null — handle separately.
 */
export function namedStageForJobState(state: string): NamedStage | null {
  switch (state) {
    case "created":
    case "uploading":
      return "Uploading";
    case "queued":
      return "Waiting";
    case "processing":
      return "Converting";
    case "validating":
      return "Checking output";
    default:
      return null;
  }
}

export function isCancellableStage(stage: NamedStage): boolean {
  return stage === "Waiting" || stage === "Converting";
}

export function isTerminalJobState(state: string): boolean {
  return (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "deleted"
  );
}

export function isDeletingJobState(state: string): boolean {
  return state === "deleting";
}
