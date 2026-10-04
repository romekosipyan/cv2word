/**
 * Browser-safe essential client events.
 * Never send filenames, tokens, contacts, or acquisition attributes (ADR-008).
 */

import { MAX_UPLOAD_BYTES } from "../pdf/limits";
import { emitEvent } from "./emit";

function sizeBucketForBytes(bytes: number): string {
  if (bytes <= 256 * 1024) return "le_256kib";
  if (bytes <= 1024 * 1024) return "le_1mib";
  if (bytes <= 5 * 1024 * 1024) return "le_5mib";
  if (bytes <= MAX_UPLOAD_BYTES) return "le_10mib";
  return "over_limit";
}

/**
 * Essential funnel signal when a file is chosen. Size bucket only — no name.
 */
export function emitFileSelected(file: { size: number }): void {
  emitEvent("file_selected", {
    sizeBucket: sizeBucketForBytes(file.size),
  });
}
