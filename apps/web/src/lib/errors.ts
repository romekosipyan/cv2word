export type ErrorCode =
  | "unsupported_type"
  | "too_large"
  | "too_many_pages"
  | "encrypted"
  | "corrupt"
  | "scan_detected"
  | "queue_full"
  | "rate_limited"
  | "conversion_failed"
  | "output_invalid"
  | "expired"
  | "unauthorized"
  | "delete_pending";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ErrorCode,
    status: number,
    message?: string,
    options?: { retryAfterSeconds?: number },
  ) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export function jsonError(
  code: ErrorCode,
  status: number,
  options?: { retryAfterSeconds?: number },
): Response {
  const body: Record<string, unknown> = { error: code };
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
  };
  if (
    options?.retryAfterSeconds != null &&
    Number.isFinite(options.retryAfterSeconds)
  ) {
    const seconds = Math.max(1, Math.ceil(options.retryAfterSeconds));
    body.retryAfterSeconds = seconds;
    headers["Retry-After"] = String(seconds);
  }
  return Response.json(body, { status, headers });
}
