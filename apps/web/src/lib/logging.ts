type LogFields = Record<string, unknown>;

const REDACT_KEYS = new Set([
  "secret",
  "token",
  "authorization",
  "cookie",
  "idempotencykey",
  "idempotency_key",
  "filename",
  "originalfilename",
  "body",
  "uploadtoken",
  "upload_token",
]);

function redactValue(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (REDACT_KEYS.has(normalized) || normalized.includes("secret") || normalized.includes("token")) {
    return "[redacted]";
  }
  if (typeof value === "string" && value.length > 256) {
    return "[omitted-long-string]";
  }
  return value;
}

function sanitize(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

export const log = {
  info(message: string, fields?: LogFields) {
    console.info(JSON.stringify({ level: "info", message, ...sanitize(fields) }));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(JSON.stringify({ level: "warn", message, ...sanitize(fields) }));
  },
  error(message: string, fields?: LogFields) {
    console.error(JSON.stringify({ level: "error", message, ...sanitize(fields) }));
  },
};
