import { getConfig } from "../config";
import type { SanitizedTelemetryEvent } from "../events/sink";
import { registerTelemetryMetricsHook } from "../events/sink";
import { emitRedactedAlert } from "./emit";
import { SlidingWindow } from "./windows";

const workerCrashes = new SlidingWindow();
const conversionStarted = new SlidingWindow();
const conversionFailed = new SlidingWindow();
const conversionReady = new SlidingWindow();

let hookInstalled = false;
let unhook: (() => void) | null = null;

/** Last-emitted markers to avoid alert spam within a window (in-process). */
let lastWorkerCrashAlertAt = 0;
let lastConversionFailedAlertAt = 0;

const ALERT_COOLDOWN_MS = 60_000;

export function resetIncidentMetricsForTests(): void {
  workerCrashes.clear();
  conversionStarted.clear();
  conversionFailed.clear();
  conversionReady.clear();
  lastWorkerCrashAlertAt = 0;
  lastConversionFailedAlertAt = 0;
  if (unhook) {
    unhook();
    unhook = null;
  }
  hookInstalled = false;
}

/**
 * Record an unexpected worker crash / uncaught work failure.
 * Redacted: opaque job id + engine version only.
 */
export function recordWorkerCrash(input?: {
  jobId?: string;
  engineVersion?: string;
  atMs?: number;
}): void {
  const at = input?.atMs ?? Date.now();
  workerCrashes.record(at);
  void evaluateWorkerCrashRate(new Date(at), {
    jobId: input?.jobId,
    engineVersion: input?.engineVersion,
  });
}

/** Feed conversion lifecycle counters from already-sanitized telemetry. */
export function observeTelemetryForAlerts(
  event: SanitizedTelemetryEvent,
  atMs: number = Date.parse(event.at) || Date.now(),
): void {
  if (event.event === "conversion_started") {
    conversionStarted.record(atMs);
    return;
  }
  if (event.event === "conversion_failed") {
    conversionFailed.record(atMs);
    void evaluateConversionFailedRate(new Date(atMs), {
      error:
        typeof event.props.error === "string" ? event.props.error : undefined,
      engineVersion:
        typeof event.props.engineVersion === "string"
          ? event.props.engineVersion
          : undefined,
    });
    return;
  }
  if (event.event === "output_ready") {
    conversionReady.record(atMs);
  }
}

export function evaluateWorkerCrashRate(
  now: Date = new Date(),
  hint?: { jobId?: string; engineVersion?: string },
): { crashes: number; alerted: boolean } {
  const config = getConfig();
  const windowSeconds = config.alertWorkerCrashWindowSeconds;
  const threshold = config.alertWorkerCrashThresholdCount;
  const crashes = workerCrashes.count(now.getTime(), windowSeconds);
  if (crashes < threshold) {
    return { crashes, alerted: false };
  }
  if (now.getTime() - lastWorkerCrashAlertAt < ALERT_COOLDOWN_MS) {
    return { crashes, alerted: false };
  }
  lastWorkerCrashAlertAt = now.getTime();
  emitRedactedAlert("worker_crash_rate", {
    crashes,
    count: crashes,
    windowSeconds,
    thresholdCount: threshold,
    jobId: hint?.jobId,
    engineVersion: hint?.engineVersion,
  });
  return { crashes, alerted: true };
}

/**
 * conversion_failed rate over started+ready+failed samples in the window.
 * rateBps = failures * 10000 / samples (basis points).
 */
export function evaluateConversionFailedRate(
  now: Date = new Date(),
  hint?: { error?: string; engineVersion?: string },
): { failures: number; samples: number; rateBps: number; alerted: boolean } {
  const config = getConfig();
  const windowSeconds = config.alertConversionFailedWindowSeconds;
  const minSamples = config.alertConversionFailedMinSamples;
  const thresholdRateBps = config.alertConversionFailedRateBps;
  const nowMs = now.getTime();

  const failures = conversionFailed.count(nowMs, windowSeconds);
  const started = conversionStarted.count(nowMs, windowSeconds);
  const ready = conversionReady.count(nowMs, windowSeconds);
  // Denominator: outcomes we observed; prefer started when present, else fail+ready.
  const samples = Math.max(started, failures + ready);
  const rateBps =
    samples > 0 ? Math.round((failures * 10_000) / samples) : 0;

  if (samples < minSamples || rateBps < thresholdRateBps) {
    return { failures, samples, rateBps, alerted: false };
  }
  if (nowMs - lastConversionFailedAlertAt < ALERT_COOLDOWN_MS) {
    return { failures, samples, rateBps, alerted: false };
  }
  lastConversionFailedAlertAt = nowMs;
  emitRedactedAlert("conversion_failed_rate", {
    failures,
    samples,
    rateBps,
    windowSeconds,
    thresholdRateBps,
    error: hint?.error,
    engineVersion: hint?.engineVersion,
  });
  return { failures, samples, rateBps, alerted: true };
}

/**
 * Periodic evaluation for rate alerts (sweeper cadence).
 * Queue wait is evaluated on capacity checks; cleanup backlog separately.
 */
export function evaluateIncidentRateAlerts(now: Date = new Date()): {
  workerCrash: ReturnType<typeof evaluateWorkerCrashRate>;
  conversionFailed: ReturnType<typeof evaluateConversionFailedRate>;
} {
  return {
    workerCrash: evaluateWorkerCrashRate(now),
    conversionFailed: evaluateConversionFailedRate(now),
  };
}

/**
 * Install the US-053 → US-043 telemetry metrics hook once per process.
 * Receives only already-sanitized essential events.
 */
export function ensureIncidentAlertsInstalled(): void {
  if (hookInstalled) return;
  unhook = registerTelemetryMetricsHook((event) => {
    observeTelemetryForAlerts(event);
  });
  hookInstalled = true;
}
