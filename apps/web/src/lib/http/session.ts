import { generateSessionId } from "../crypto";
import { getConfig } from "../config";
import {
  SESSION_COOKIE,
  parseCookies,
  serializeCookie,
} from "./cookies";

export function getOrCreateSessionId(request: Request): {
  sessionId: string;
  setCookie: string | null;
} {
  const cookies = parseCookies(request.headers.get("cookie"));
  const existing = cookies.get(SESSION_COOKIE);
  if (existing && existing.length >= 16) {
    return { sessionId: existing, setCookie: null };
  }
  const sessionId = generateSessionId();
  const { jobAccessTtlSeconds } = getConfig();
  const setCookie = serializeCookie(SESSION_COOKIE, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: Math.max(jobAccessTtlSeconds, 24 * 60 * 60),
  });
  return { sessionId, setCookie };
}
