import { log } from "../logging";
import {
  MARKETING_TELEMETRY_ENABLED,
  isEssentialEvent,
  isSpecEvent,
  type EssentialEventName,
  type SpecEventName,
  type TelemetryProps,
} from "./catalog";
import { sanitizeTelemetryProps } from "./sanitize";
import { notifyTelemetrySink } from "./sink";

export type EmitResult =
  | { ok: true; event: EssentialEventName; props: TelemetryProps }
  | { ok: false; reason: "unknown_event" | "not_essential" | "marketing_gated" };

/**
 * Emit a privacy-safe essential telemetry event.
 * Unknown names, non-essential catalog names, and marketing-gated events are dropped.
 */
export function emitEvent(
  name: SpecEventName | string,
  props?: Record<string, unknown> | TelemetryProps,
): EmitResult {
  if (!isSpecEvent(name)) {
    return { ok: false, reason: "unknown_event" };
  }

  // ADR-008: landing_view / quality_feedback and acquisition stay off.
  if (name === "landing_view" || name === "quality_feedback") {
    if (!MARKETING_TELEMETRY_ENABLED) {
      return { ok: false, reason: "marketing_gated" };
    }
  }

  if (!isEssentialEvent(name)) {
    return { ok: false, reason: "not_essential" };
  }

  const cleaned = sanitizeTelemetryProps(props);
  const record = {
    event: name,
    props: cleaned,
    at: new Date().toISOString(),
  };
  notifyTelemetrySink(record);

  // Distinct channel so ops logs (e.g. deletion tiers) stay separate.
  log.info("telemetry", { event: name, ...cleaned });

  return { ok: true, event: name, props: cleaned };
}

/** Convenience: capacity / quota / rate rejects as validation_failed. */
export function emitCapacityOrQuotaReject(error: "queue_full" | "rate_limited"): EmitResult {
  return emitEvent("validation_failed", { error });
}
