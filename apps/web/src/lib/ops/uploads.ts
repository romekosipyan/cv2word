import { getConfig } from "../config";
import { ApiError } from "../errors";
import { log } from "../logging";

/** Retry hint while intake is halted (not a measured SLA). */
const UPLOADS_DISABLED_RETRY_AFTER_SECONDS = 3600;

/**
 * US-112: feature shutdown stops new upload intake.
 * Expiry sweeper and user DELETE must keep running independently.
 */
export function assertUploadsEnabled(): void {
  if (!getConfig().uploadsDisabled) {
    return;
  }
  log.warn("uploads_disabled_reject", {
    error: "queue_full",
    reason: "uploads_disabled",
  });
  throw new ApiError("queue_full", 503, "queue_full", {
    retryAfterSeconds: UPLOADS_DISABLED_RETRY_AFTER_SECONDS,
  });
}
