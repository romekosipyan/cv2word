import { log } from "../logging";
import { convertLeasedJob } from "./convert-work";
import { processOneSimulatedJob, type ProcessOneResult } from "./worker-sim";

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/**
 * Local-dev / single-process convert loop (US-010).
 *
 * Dequeues job references, acquires leases, spawns the Python engine outside
 * request handlers. Production maps to ECS tasks polling SQS (ADR-002).
 *
 * Disabled when CONVERT_WORKER=0 or VITEST / NODE_ENV=test.
 */
export function convertWorkerEnabled(): boolean {
  if (process.env.CONVERT_WORKER === "0") return false;
  if (process.env.VITEST) return false;
  if (process.env.NODE_ENV === "test") return false;
  return process.env.CONVERT_WORKER !== "off";
}

export async function processOneConvertJob(): Promise<ProcessOneResult> {
  return processOneSimulatedJob(convertLeasedJob);
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // Drain a few messages per tick so backlog does not stall behind the interval.
    for (let i = 0; i < 3; i += 1) {
      const result = await processOneConvertJob();
      if (!result.handled) break;
    }
  } catch (err) {
    log.warn("convert_worker_tick_error", {
      error: "conversion_failed",
    });
    void err;
  } finally {
    ticking = false;
  }
}

export function ensureConvertWorkerStarted(): void {
  if (!convertWorkerEnabled()) return;
  if (timer) return;
  const intervalMs = Number.parseInt(
    process.env.CONVERT_WORKER_POLL_MS ?? "1000",
    10,
  );
  const ms = Number.isFinite(intervalMs) && intervalMs >= 200 ? intervalMs : 1000;
  timer = setInterval(() => {
    void tick();
  }, ms);
  // Unref so the timer alone does not keep the process alive in scripts.
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
  log.info("convert_worker_started", { pollMs: ms });
  void tick();
}

export function stopConvertWorkerForTests(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  ticking = false;
}
