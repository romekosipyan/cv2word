import { createHash } from "node:crypto";

/**
 * Derive an opaque client key for abuse controls.
 * Prefer first X-Forwarded-For hop; never log the raw address.
 */
export function clientKeyFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const raw =
    (forwarded?.split(",")[0]?.trim() || realIp?.trim() || "unknown").slice(
      0,
      128,
    );
  return createHash("sha256").update(`rtw-rl:${raw}`).digest("hex").slice(0, 32);
}
