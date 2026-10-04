import { hashesEqual } from "../crypto";
import { ApiError } from "../errors";
import {
  JOB_SECRET_COOKIE_PREFIX,
  parseCookies,
} from "../http/cookies";
import type { JobRecord } from "./types";
import { findJobById } from "./repository";

/**
 * Fixed stand-in hash so missing-job authorize still pays sha256 + timingSafeEqual
 * (US-091: reduce existence oracles vs wrong-secret).
 */
const MISSING_JOB_TOKEN_HASH =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Extract job bearer secret from Authorization: Bearer or path-scoped HttpOnly cookie.
 * Never read secrets from query strings.
 */
export function extractJobSecret(request: Request, jobId: string): string | null {
  const url = new URL(request.url);
  if (url.searchParams.has("secret") || url.searchParams.has("token")) {
    throw new ApiError("unauthorized", 401);
  }

  const auth = request.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const cookies = parseCookies(request.headers.get("cookie"));
  const fromCookie = cookies.get(`${JOB_SECRET_COOKIE_PREFIX}${jobId}`);
  return fromCookie ?? null;
}

export function rejectQuerySecrets(request: Request): void {
  const url = new URL(request.url);
  for (const key of url.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.includes("secret") || lower.includes("token") || lower === "key") {
      throw new ApiError("unauthorized", 401);
    }
  }
}

export function authorizeJob(
  request: Request,
  jobId: string,
  options: { allowDeletePending?: boolean } = {},
): JobRecord {
  rejectQuerySecrets(request);

  const secret = extractJobSecret(request, jobId);
  if (!secret) {
    throw new ApiError("unauthorized", 401);
  }

  const job = findJobById(jobId);
  // Always hash-compare (dummy when missing) so fail-closed paths stay constant-cost.
  const tokenHash = job?.tokenHash ?? MISSING_JOB_TOKEN_HASH;
  if (!hashesEqual(tokenHash, secret)) {
    throw new ApiError("unauthorized", 401);
  }
  if (!job) {
    throw new ApiError("unauthorized", 401);
  }

  if (job.state === "deleted") {
    throw new ApiError("unauthorized", 401);
  }

  // Expiry is an access condition (Job State Machine): prefer expired over
  // delete_pending so post-window GETs stay a neutral unavailable result.
  if (new Date(job.expiresAt).getTime() < Date.now()) {
    throw new ApiError("expired", 410);
  }

  if (
    (job.tombstone === 1 || job.state === "deleting") &&
    !options.allowDeletePending
  ) {
    throw new ApiError("delete_pending", 202);
  }

  return job;
}
