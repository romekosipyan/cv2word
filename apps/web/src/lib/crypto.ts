import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig } from "./config";

export function generateId(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** High-entropy job bearer secret (never store raw; never put in URLs). */
export function generateJobSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function generateSessionId(): string {
  return randomBytes(24).toString("base64url");
}

export function hashSecret(secret: string): string {
  const pepper = getConfig().jobSecretPepper;
  return createHash("sha256").update(`${pepper}:${secret}`).digest("hex");
}

export function secretsEqual(a: string, b: string): boolean {
  const ha = Buffer.from(hashSecret(a), "hex");
  const hb = Buffer.from(hashSecret(b), "hex");
  if (ha.length !== hb.length) return false;
  return timingSafeEqual(ha, hb);
}

export function hashesEqual(storedHash: string, candidateSecret: string): boolean {
  const candidate = Buffer.from(hashSecret(candidateSecret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}
