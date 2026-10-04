import { log } from "../logging";
import { alertPayloadLooksLeaky, sanitizeAlertFields } from "./sanitize";
import type {
  IncidentAlertName,
  RedactedAlertFields,
  RedactedAlertPayload,
} from "./types";

export type AlertSink = (payload: RedactedAlertPayload) => void;

const sinks: AlertSink[] = [];
let capture: RedactedAlertPayload[] | null = null;

export function registerAlertSink(sink: AlertSink): () => void {
  sinks.push(sink);
  return () => {
    const idx = sinks.indexOf(sink);
    if (idx >= 0) sinks.splice(idx, 1);
  };
}

/** Test helper: capture redacted alerts in-process. */
export function beginAlertCapture(): void {
  capture = [];
}

export function endAlertCapture(): RedactedAlertPayload[] {
  const out = capture ?? [];
  capture = null;
  return out;
}

export function getCapturedAlerts(): readonly RedactedAlertPayload[] {
  return capture ?? [];
}

export function resetAlertSinksForTests(): void {
  sinks.length = 0;
  capture = null;
}

/**
 * Emit a redacted incident alert. Fields are sanitized fail-closed before log/sink.
 * Never accepts filenames, resume text, tokens, or request bodies.
 */
export function emitRedactedAlert(
  alert: IncidentAlertName,
  fields?: Record<string, unknown> | RedactedAlertFields | null,
): RedactedAlertPayload {
  let cleaned = sanitizeAlertFields(fields as Record<string, unknown> | null);
  const draft: RedactedAlertPayload = {
    alert,
    fields: cleaned,
    at: new Date().toISOString(),
  };

  const serialized = JSON.stringify(draft);
  if (alertPayloadLooksLeaky(serialized)) {
    cleaned = { reason: "sanitize_rejected" };
  }

  const payload: RedactedAlertPayload = {
    alert,
    fields: cleaned,
    at: draft.at,
  };

  log.warn(alert, { alert, ...cleaned });

  if (capture) {
    capture.push(payload);
  }
  for (const sink of sinks) {
    try {
      sink(payload);
    } catch {
      // Sinks must not break conversion / sweep paths.
    }
  }

  return payload;
}
