/**
 * Same-tab job credentials. Never put secrets or job ids in the URL.
 * HttpOnly cookies are also set by the API; this Bearer copy supports
 * same-tab resume when the cookie path alone is not enough for the client.
 */
const STORAGE_KEY = "rtw.activeJob";

export type ActiveJobCredentials = {
  id: string;
  secret: string;
};

export function saveActiveJob(creds: ActiveJobCredentials): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // Private mode / disabled storage — cookie path may still authorize.
  }
}

export function loadActiveJob(): ActiveJobCredentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveJobCredentials;
    if (
      typeof parsed?.id === "string" &&
      typeof parsed?.secret === "string" &&
      parsed.id &&
      parsed.secret
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function clearActiveJob(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
