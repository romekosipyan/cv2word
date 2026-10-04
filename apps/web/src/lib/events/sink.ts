import type { EssentialEventName, TelemetryProps } from "./catalog";

export type SanitizedTelemetryEvent = {
  event: EssentialEventName;
  props: TelemetryProps;
  at: string;
};

/**
 * Metrics hook surface for US-043 (redacted metrics / incident alerts).
 * Receives only already-sanitized essential events — never raw request bodies.
 * Production wiring: `ensureIncidentAlertsInstalled()` in instrumentation.
 */
export type TelemetryMetricsHook = (event: SanitizedTelemetryEvent) => void;

const hooks: TelemetryMetricsHook[] = [];
let capture: SanitizedTelemetryEvent[] | null = null;

export function registerTelemetryMetricsHook(
  hook: TelemetryMetricsHook,
): () => void {
  hooks.push(hook);
  return () => {
    const idx = hooks.indexOf(hook);
    if (idx >= 0) hooks.splice(idx, 1);
  };
}

/** Test helper: capture emitted essential events in-process. */
export function beginTelemetryCapture(): void {
  capture = [];
}

export function endTelemetryCapture(): SanitizedTelemetryEvent[] {
  const out = capture ?? [];
  capture = null;
  return out;
}

export function getCapturedTelemetry(): readonly SanitizedTelemetryEvent[] {
  return capture ?? [];
}

export function resetTelemetrySinkForTests(): void {
  hooks.length = 0;
  capture = null;
}

export function notifyTelemetrySink(event: SanitizedTelemetryEvent): void {
  if (capture) {
    capture.push(event);
  }
  for (const hook of hooks) {
    try {
      hook(event);
    } catch {
      // Hooks must not break conversion paths.
    }
  }
}
