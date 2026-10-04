import { ensureIncidentAlertsInstalled } from "./src/lib/alerts";
import { ensureExpirySweeperStarted } from "./src/lib/jobs/sweeper";
import { ensureConvertWorkerStarted } from "./src/lib/jobs/worker-runner";

/**
 * Next.js instrumentation — start expiry sweeper, convert worker loop, alerts.
 * Conversion still runs in a spawned Python process, never in a request handler.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  ensureIncidentAlertsInstalled();
  ensureExpirySweeperStarted();
  ensureConvertWorkerStarted();
}
