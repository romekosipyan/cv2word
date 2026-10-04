/**
 * Ready-state copy for US-020. Distinguishes "file ready" from "user saved".
 */

export const DOWNLOAD_CTA = "Download editable DOCX";
export const DELETE_FILES_CTA = "Delete my files";
export const CONVERT_ANOTHER_CTA = "Convert another resume";

export const READY_HEADING = "Your Word file is ready";

export const READY_BODY =
  "Download the editable DOCX, then open it in Word or another editor. Review the formatting before you send it.";

/** Shown after a download request starts — never claims the user saved/opened the file. */
export const DOWNLOAD_STARTED_NOTE =
  "Download started in your browser. That does not confirm the file was saved or opened — check your downloads folder if needed. You can download again until the job expires or you delete your files.";

export const DOWNLOAD_UNAVAILABLE_NOTE =
  "The editable DOCX is not available to download right now. Try again, or convert another resume.";

/**
 * Human-readable expiry. Never puts job ids or secrets in the string.
 */
export function formatExpiryLabel(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): string {
  const ms = Date.parse(expiresAtIso);
  if (!Number.isFinite(ms)) {
    return "This download expires automatically. Closing the tab is not deletion.";
  }
  const formatted = new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (ms <= nowMs) {
    return "This download has expired. Closing the tab is not deletion — start a fresh conversion if you still need a file.";
  }
  return `Available until ${formatted}. The job expires automatically after that. Closing the tab is not deletion.`;
}

/** Affirmative over-claims (must not appear as success proof after download click). */
export const FORBIDDEN_DOWNLOAD_CLAIM_PATTERNS = [
  /successfully saved/i,
  /downloaded successfully/i,
  /file is saved/i,
  /you saved the file/i,
  /file has been saved/i,
  /opened successfully/i,
] as const;
