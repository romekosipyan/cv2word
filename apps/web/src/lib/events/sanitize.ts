import {
  ALLOWED_EVENT_PROPERTY_KEYS,
  FORBIDDEN_PROPERTY_KEY_FRAGMENTS,
  type TelemetryProps,
} from "./catalog";
import type { ErrorCode } from "../errors";

const ALLOWED_KEY_SET = new Set<string>(ALLOWED_EVENT_PROPERTY_KEYS);

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
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isForbiddenPropertyKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return FORBIDDEN_PROPERTY_KEY_FRAGMENTS.some(
    (frag) => normalized === frag || normalized.includes(frag),
  );
}

function sanitizeScalar(key: string, value: unknown): string | number | undefined {
  if (value == null) return undefined;
  if (key === "error") {
    if (typeof value === "string" && ERROR_CODES.has(value)) {
      return value;
    }
    return undefined;
  }
  if (key === "durationMs") {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
    return undefined;
  }
  if (typeof value === "string") {
    // Opaque ids / enum-like buckets — hard cap; never long free text.
    if (value.length > 64) return undefined;
    if (/[\r\n\0]/.test(value)) return undefined;
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

/**
 * Keep only allowlisted keys with safe scalar values.
 * Drops filenames, secrets, tokens, contacts, URLs, and resume text.
 */
export function sanitizeTelemetryProps(
  props?: Record<string, unknown> | TelemetryProps | null,
): TelemetryProps {
  if (!props) return {};
  const out: TelemetryProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (isForbiddenPropertyKey(key)) continue;
    if (!ALLOWED_KEY_SET.has(key)) continue;
    const cleaned = sanitizeScalar(key, value);
    if (cleaned === undefined) continue;
    if (key === "error") {
      out.error = cleaned as ErrorCode;
      continue;
    }
    if (key === "durationMs") {
      out.durationMs = cleaned as number;
      continue;
    }
    (out as Record<string, unknown>)[key] = cleaned;
  }
  return out;
}

/** True if a serialized payload appears to contain forbidden material. */
export function payloadLooksLeaky(serialized: string): boolean {
  const lower = serialized.toLowerCase();
  if (lower.includes("[redacted]")) return false;
  // Common leak patterns in tests / misuse.
  if (/%pdf-/.test(lower)) return true;
  if (lower.includes("resume of")) return true;
  if (lower.includes("authorization")) return true;
  if (/"filename"\s*:/.test(lower)) return true;
  if (/"secret"\s*:/.test(lower)) return true;
  if (/"token"\s*:/.test(lower)) return true;
  if (/https?:\/\//.test(serialized)) return true;
  return false;
}
