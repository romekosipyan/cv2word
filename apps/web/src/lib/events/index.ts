export {
  ALLOWED_EVENT_PROPERTY_KEYS,
  ESSENTIAL_EVENT_NAMES,
  FORBIDDEN_PROPERTY_KEY_FRAGMENTS,
  MARKETING_TELEMETRY_ENABLED,
  SPEC_EVENT_NAMES,
  isEssentialEvent,
  isSpecEvent,
  type EssentialEventName,
  type SpecEventName,
  type TelemetryProps,
} from "./catalog";
export { emitCapacityOrQuotaReject, emitEvent } from "./emit";
export { emitFileSelected } from "./client";
export {
  beginTelemetryCapture,
  endTelemetryCapture,
  getCapturedTelemetry,
  registerTelemetryMetricsHook,
  resetTelemetrySinkForTests,
  type SanitizedTelemetryEvent,
  type TelemetryMetricsHook,
} from "./sink";
export {
  isForbiddenPropertyKey,
  payloadLooksLeaky,
  sanitizeTelemetryProps,
} from "./sanitize";
