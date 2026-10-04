import { DOWNLOAD_FILENAME } from "./jobApi";

/**
 * Trigger a same-tab file save dialog from an in-memory blob.
 * Uses an object URL — never puts job secrets in the document location.
 */
export function triggerBrowserDownload(
  blob: Blob,
  filename: string = DOWNLOAD_FILENAME,
): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    // Keep out of the accessibility tree; this is a programmatic gesture.
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick so the browser can start the download.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
