/**
 * Incident alert names (US-043 / ADR-002 / SPEC-EVENTS).
 * Payloads are fail-closed: sanitized codes, buckets, engine version, opaque ids only.
 */

export const INCIDENT_ALERT_NAMES = [
  "worker_crash_rate",
  "cleanup_backlog",
  "queue_wait",
  "conversion_failed_rate",
  /** Capacity rejects (queue_full) — skill / infra; not a separate AC checkbox. */
  "capacity_reject",
] as const;

export type IncidentAlertName = (typeof INCIDENT_ALERT_NAMES)[number];

/** Keys permitted on redacted alert payloads after sanitization. */
export const ALLOWED_ALERT_PROPERTY_KEYS = [
  "count",
  "rateBps",
  "windowSeconds",
  "thresholdCount",
  "thresholdRateBps",
  "thresholdSeconds",
  "ageSeconds",
  "predictedWaitSeconds",
  "depth",
  "readyWorkers",
  "retryAfterSeconds",
  "samples",
  "failures",
  "crashes",
  "oldestJobId",
  "jobId",
  "error",
  "engineVersion",
  "sizeBucket",
  "pageBucket",
  "reason",
] as const;

export type AllowedAlertPropertyKey =
  (typeof ALLOWED_ALERT_PROPERTY_KEYS)[number];

export type RedactedAlertFields = Partial<
  Record<AllowedAlertPropertyKey, string | number | null>
>;

export type RedactedAlertPayload = {
  alert: IncidentAlertName;
  fields: RedactedAlertFields;
  at: string;
};
