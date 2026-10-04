import { getConfig } from "../config";
import { ApiError } from "../errors";
import { emitCapacityOrQuotaReject } from "../events";
import { log } from "../logging";
import { clientKeyFromRequest } from "./client";
import { getMemoryRateLimiter } from "./memory";

export { clientKeyFromRequest } from "./client";
export { resetRateLimiterForTests } from "./memory";

export type RateLimitBucket = "create" | "poll" | "download";

function limitsFor(bucket: RateLimitBucket): {
  max: number;
  windowSeconds: number;
} {
  const config = getConfig();
  switch (bucket) {
    case "create":
      return {
        max: config.rateLimitCreateMax,
        windowSeconds: config.rateLimitCreateWindowSeconds,
      };
    case "poll":
      return {
        max: config.rateLimitPollMax,
        windowSeconds: config.rateLimitPollWindowSeconds,
      };
    case "download":
      return {
        max: config.rateLimitDownloadMax,
        windowSeconds: config.rateLimitDownloadWindowSeconds,
      };
  }
}

/**
 * Enforce per-client (and optionally per-job) request rate limits.
 * Rejects before insert/quota charge. Never logs IP, secrets, or filenames.
 */
export function assertRateLimit(
  request: Request,
  bucket: RateLimitBucket,
  options?: { jobId?: string },
): void {
  const { max, windowSeconds } = limitsFor(bucket);
  if (max <= 0) {
    return;
  }
  const clientKey = clientKeyFromRequest(request);
  const key = options?.jobId
    ? `${bucket}:${clientKey}:${options.jobId}`
    : `${bucket}:${clientKey}`;
  const result = getMemoryRateLimiter().consume(
    key,
    max,
    windowSeconds * 1000,
  );
  if (result.ok) {
    return;
  }
  log.warn("rate_limit_reject", {
    error: "rate_limited",
    bucket,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  emitCapacityOrQuotaReject("rate_limited");
  throw new ApiError("rate_limited", 429, "rate_limited", {
    retryAfterSeconds: result.retryAfterSeconds,
  });
}
