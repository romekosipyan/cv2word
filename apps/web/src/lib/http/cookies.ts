import { getConfig } from "../config";

export const SESSION_COOKIE = "rtw_sid";
export const JOB_SECRET_COOKIE_PREFIX = "rtw_job_";

export function jobSecretCookieName(jobId: string): string {
  return `${JOB_SECRET_COOKIE_PREFIX}${jobId}`;
}

export function parseCookies(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    map.set(key, decodeURIComponent(value));
  }
  return map;
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    path?: string;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    maxAge?: number;
    secure?: boolean;
  } = {},
): string {
  const { cookieSecure } = getConfig();
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `SameSite=${options.sameSite ?? "Lax"}`,
  ];
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure ?? cookieSecure) parts.push("Secure");
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}
