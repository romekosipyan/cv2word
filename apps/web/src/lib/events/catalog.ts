/**
 * SPEC-EVENTS allowlist — privacy-safe telemetry.
 *
 * Essential-only subset ships while ADR-008 (consent / legal basis) is open.
 * Non-essential marketing tags and consented acquisition attributes stay off
 * converter screens until that ADR is decided.
 */

import type { ErrorCode } from "../errors";

/** Full SPEC-EVENTS catalog (including deferred / gated names). */
export const SPEC_EVENT_NAMES = [
  "landing_view",
  "file_selected",
  "validation_failed",
  "upload_completed",
  "job_queued",
  "conversion_started",
  "conversion_failed",
  "output_ready",
  "download_requested",
  "delete_requested",
  "deletion_completed",
  "quality_feedback",
] as const;

export type SpecEventName = (typeof SPEC_EVENT_NAMES)[number];

/**
 * Essential operational events allowed while ADR-008 is open.
 * Excludes marketing landing acquisition, quality_feedback (optional),
 * and any non-essential pixels/tags on converter screens.
 */
export const ESSENTIAL_EVENT_NAMES = [
  "file_selected",
  "validation_failed",
  "upload_completed",
  "job_queued",
  "conversion_started",
  "conversion_failed",
  "output_ready",
  "download_requested",
  "delete_requested",
  "deletion_completed",
] as const;

export type EssentialEventName = (typeof ESSENTIAL_EVENT_NAMES)[number];

/** Properties permitted on essential events (SPEC-EVENTS + lifecycle). */
export const ALLOWED_EVENT_PROPERTY_KEYS = [
  "jobId",
  "sizeBucket",
  "pageBucket",
  "error",
  "durationMs",
  "engineVersion",
  "state",
  "priorState",
  "reason",
] as const;

export type AllowedEventPropertyKey =
  (typeof ALLOWED_EVENT_PROPERTY_KEYS)[number];

export type TelemetryProps = {
  jobId?: string;
  sizeBucket?: string;
  pageBucket?: string;
  error?: ErrorCode;
  durationMs?: number;
  engineVersion?: string;
  state?: string;
  priorState?: string;
  /** Deletion / expiry reason code — never free text from the document. */
  reason?: string;
};

/** Forbidden keys (case-insensitive, separators stripped) — never emit. */
export const FORBIDDEN_PROPERTY_KEY_FRAGMENTS = [
  "filename",
  "originalfilename",
  "secret",
  "token",
  "authorization",
  "cookie",
  "password",
  "email",
  "phone",
  "contact",
  "resume",
  "text",
  "body",
  "snapshot",
  "url",
  "referrer",
  "acquisition",
  "utm",
  "gclid",
  "fbclid",
  "idempotency",
] as const;

/** ADR-008 open: marketing / acquisition measurement stays disabled. */
export const MARKETING_TELEMETRY_ENABLED = false;

export function isEssentialEvent(name: string): name is EssentialEventName {
  return (ESSENTIAL_EVENT_NAMES as readonly string[]).includes(name);
}

export function isSpecEvent(name: string): name is SpecEventName {
  return (SPEC_EVENT_NAMES as readonly string[]).includes(name);
}
