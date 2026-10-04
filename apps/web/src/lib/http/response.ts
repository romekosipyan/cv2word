import { ApiError, jsonError } from "../errors";
import { log } from "../logging";

export function handleRouteError(err: unknown): Response {
  if (err instanceof ApiError) {
    return jsonError(err.code, err.status, {
      retryAfterSeconds: err.retryAfterSeconds,
    });
  }
  log.error("unhandled_route_error", {
    name: err instanceof Error ? err.name : "unknown",
  });
  return jsonError("conversion_failed", 500);
}

export function withNoStore(init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return headers;
}
