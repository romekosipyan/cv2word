import { getConfig } from "../config";
import { ApiError } from "../errors";

/** Origin / Referer check for cookie-authenticated mutations (CSRF). */
export function assertMutatingOrigin(request: Request): void {
  const { allowedOrigins } = getConfig();
  const origin = request.headers.get("origin");
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      throw new ApiError("unauthorized", 403);
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refOrigin)) {
        throw new ApiError("unauthorized", 403);
      }
      return;
    } catch {
      throw new ApiError("unauthorized", 403);
    }
  }

  // Same-origin fetch from non-browser clients (tests, curl) may omit Origin.
  // Require either Origin/Referer or an explicit Authorization bearer for mutations.
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return;
  }

  // POST /api/jobs uses session cookie; allow when no Origin in local/test if host matches.
  const host = request.headers.get("host");
  if (host && allowedOrigins.some((o) => o.includes(host))) {
    return;
  }

  throw new ApiError("unauthorized", 403);
}

export function publicBaseUrl(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
