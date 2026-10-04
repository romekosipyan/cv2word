import { isForbiddenPropertyKey, payloadLooksLeaky } from "../events/sanitize";
import {
  ALLOWED_ALERT_PROPERTY_KEYS,
  INCIDENT_ALERT_NAMES,
  type IncidentAlertName,
  type RedactedAlertFields,
} from "./types";

const ALLOWED_KEY_SET = new Set<string>(ALLOWED_ALERT_PROPERTY_KEYS);

const ALERT_NAME_SET = new Set<string>(INCIDENT_ALERT_NAMES);

const ERROR_CODES = new Set<string>([
  "unsupported_type",
  "too_large",
  "too_many_pages",
  "encrypted",
  "corrupt",
  "scan_detected",
  "queue_full",
  "rate_limited",
  "conversion_failed",
  "output_invalid",
  "expired",
  "unauthorized",
  "delete_pending",
  "sanitize_rejected",
]);

function sanitizeScalar(
  key: string,
  value: unknown,
): string | number | null | undefined {
  if (value === null) {
    if (key === "oldestJobId" || key === "jobId") return null;
    return undefined;
  }
  if (value == null) return undefined;

  if (key === "error" || key === "reason") {
    if (typeof value === "string" && ERROR_CODES.has(value)) return value;
    // reason may also be a short enum-like ops code (no free text).
    if (
      key === "reason" &&
      typeof value === "string" &&
      value.length <= 64 &&
      /^[a-z][a-z0-9_]*$/.test(value)
    ) {
      return value;
    }
    return undefined;
  }

  if (
    key === "oldestJobId" ||
    key === "jobId" ||
    key === "engineVersion" ||
    key === "sizeBucket" ||
    key === "pageBucket"
  ) {
    if (typeof value !== "string") return undefined;
    if (value.length === 0 || value.length > 64) return undefined;
    if (/[\r\n\0]/.test(value)) return undefined;
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Rates / counts / seconds — integers preferred; allow non-negative.
    if (value < 0) return undefined;
    return Number.isInteger(value) ? value : Math.round(value);
  }

  return undefined;
}

/**
 * Fail-closed sanitizer for alert fields.
 * Drops unknown keys, forbidden fragments, and any payload that still looks leaky.
 */
export function sanitizeAlertFields(
  fields?: Record<string, unknown> | null,
): RedactedAlertFields {
  if (!fields) return {};
  const out: RedactedAlertFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isForbiddenPropertyKey(key)) continue;
    if (!ALLOWED_KEY_SET.has(key)) continue;
    const cleaned = sanitizeScalar(key, value);
    if (cleaned === undefined) continue;
    (out as Record<string, string | number | null>)[key] = cleaned;
  }

  const serialized = JSON.stringify(out);
  if (payloadLooksLeaky(serialized)) {
    return { reason: "sanitize_rejected" };
  }
  return out;
}

export function isIncidentAlertName(name: string): name is IncidentAlertName {
  return ALERT_NAME_SET.has(name);
}

/** True when a serialized alert line appears to contain forbidden material. */
export function alertPayloadLooksLeaky(serialized: string): boolean {
  return payloadLooksLeaky(serialized);
}
