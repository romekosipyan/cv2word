import type { ErrorCode } from "@/lib/errors";
import { MAX_PAGES, MAX_UPLOAD_BYTES, MIN_PAGES } from "@/lib/pdf/limits";

const MAX_MIB = MAX_UPLOAD_BYTES / (1024 * 1024);

/** Every code in vault/06-quality/Failure Catalog.md */
export const FAILURE_CATALOG_CODES = [
  "unsupported_type",
  "too_large",
  "too_many_pages",
  "encrypted",
  "corrupt",
  "scan_detected",
  "conversion_failed",
  "queue_full",
  "rate_limited",
  "output_invalid",
  "expired",
  "unauthorized",
  "delete_pending",
] as const satisfies readonly ErrorCode[];

export type FailureCatalogCode = (typeof FAILURE_CATALOG_CODES)[number];

export type FailureVariant = "failure" | "unavailable" | "pending";

export type FailureActionKind =
  | "reselect"
  | "retry_later"
  | "start_fresh"
  | "wait_cleanup";

export type FailureView = {
  code: FailureCatalogCode | "unknown";
  variant: FailureVariant;
  title: string;
  message: string;
  nextAction: string;
  actionKind: FailureActionKind;
  /** Shown for expired/unauthorized — lost credentials cannot be recovered by email. */
  credentialNote?: string;
};

export type FailureOptions = {
  retryAfterSeconds?: number;
};

function retryTiming(seconds?: number): string {
  if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
    const rounded = Math.max(1, Math.ceil(seconds));
    if (rounded < 60) {
      return `Wait about ${rounded} seconds, then try again.`;
    }
    const minutes = Math.ceil(rounded / 60);
    return `Wait about ${minutes} minute${minutes === 1 ? "" : "s"}, then try again.`;
  }
  return "Wait about a minute, then try again.";
}

const UNAVAILABLE_CREDENTIAL_NOTE =
  "Lost access cannot be recovered by email. Choose a PDF and start a new conversion in this browser.";

/**
 * Map a sanitized API/error code to user-facing copy and a next action.
 * Never expose parser internals. Expired and unauthorized share a neutral unavailable state.
 */
export function failureForCode(
  code: string,
  options?: FailureOptions,
): FailureView {
  const retry = retryTiming(options?.retryAfterSeconds);

  switch (code as ErrorCode) {
    case "unsupported_type":
      return {
        code: "unsupported_type",
        variant: "failure",
        title: "Unsupported file",
        message:
          "Only PDF files are supported. Choose a single PDF resume and try again.",
        nextAction: "Choose a PDF resume, then convert again.",
        actionKind: "reselect",
      };
    case "too_large":
      return {
        code: "too_large",
        variant: "failure",
        title: "File too large",
        message: `This file exceeds the ${MAX_MIB} MiB maximum (${MAX_UPLOAD_BYTES.toLocaleString()} bytes). Choose a smaller PDF.`,
        nextAction: "Choose a smaller PDF (within the size limit), then convert again.",
        actionKind: "reselect",
      };
    case "too_many_pages":
      return {
        code: "too_many_pages",
        variant: "failure",
        title: "Too many pages",
        message: `This PDF exceeds the ${MAX_PAGES}-page maximum (allowed: ${MIN_PAGES}–${MAX_PAGES} pages). Choose a shorter resume.`,
        nextAction: `Choose a PDF with ${MIN_PAGES}–${MAX_PAGES} pages, then convert again.`,
        actionKind: "reselect",
      };
    case "encrypted":
      return {
        code: "encrypted",
        variant: "failure",
        title: "Protected PDF",
        message:
          "This PDF is password-protected or encrypted. Upload an unlocked PDF.",
        nextAction: "Export or save an unlocked PDF, then convert again.",
        actionKind: "reselect",
      };
    case "corrupt":
      return {
        code: "corrupt",
        variant: "failure",
        title: "Unreadable PDF",
        message:
          "This PDF could not be read. Try exporting a fresh PDF from your editor.",
        nextAction: "Export a fresh PDF, choose it here, then convert again.",
        actionKind: "reselect",
      };
    case "scan_detected":
      return {
        code: "scan_detected",
        variant: "failure",
        title: "Scanned or image-only PDF",
        message:
          "This looks like a scanned or image-only PDF. A text-based PDF is required. OCR is not available yet.",
        nextAction:
          "Upload a text-based PDF (exported from a word processor), then convert again.",
        actionKind: "reselect",
      };
    case "queue_full":
      return {
        code: "queue_full",
        variant: "failure",
        title: "Queue is full",
        message: `The conversion queue is full right now. ${retry} You were not charged.`,
        nextAction: `${retry} Then start a new conversion.`,
        actionKind: "retry_later",
      };
    case "rate_limited":
      return {
        code: "rate_limited",
        variant: "failure",
        title: "Too many requests",
        message: `Too many requests right now, or the free conversion limit was reached. ${retry} You were not charged.`,
        nextAction: `${retry} Then start a new conversion.`,
        actionKind: "retry_later",
      };
    case "conversion_failed":
      return {
        code: "conversion_failed",
        variant: "failure",
        title: "Conversion failed",
        message:
          "Conversion could not finish. Your files expire automatically — you can start a new attempt.",
        nextAction: "Choose a PDF and start a new conversion.",
        actionKind: "start_fresh",
      };
    case "output_invalid":
      return {
        code: "output_invalid",
        variant: "failure",
        title: "Result not usable",
        message:
          "The result was not a valid editable Word document. Download is blocked.",
        nextAction: "Try another text-based PDF, then convert again.",
        actionKind: "reselect",
      };
    case "expired":
    case "unauthorized":
      // Same neutral unavailable copy — do not disclose another job or distinguish causes.
      return {
        code: code as "expired" | "unauthorized",
        variant: "unavailable",
        title: "Job unavailable",
        message:
          "This conversion is no longer available. Choose a PDF and convert again.",
        nextAction: "Start a fresh upload with a new PDF.",
        actionKind: "start_fresh",
        credentialNote: UNAVAILABLE_CREDENTIAL_NOTE,
      };
    case "delete_pending":
      return {
        code: "delete_pending",
        variant: "pending",
        title: "Deletion in progress",
        message:
          "Deletion was requested. Access is revoked. Cleanup may still be finishing; do not assume files are fully removed until confirmed.",
        nextAction:
          "Wait for cleanup to finish, or start a new conversion after access is gone.",
        actionKind: "wait_cleanup",
      };
    default:
      return {
        code: "unknown",
        variant: "failure",
        title: "Something went wrong",
        message: "Something went wrong. Choose a PDF and try again.",
        nextAction: "Choose a PDF and start a new conversion.",
        actionKind: "start_fresh",
      };
  }
}

/** User-facing failure message only (Failure Catalog). */
export function messageForErrorCode(
  code: string,
  options?: FailureOptions,
): string {
  return failureForCode(code, options).message;
}

export type ClientValidationIssue =
  | { ok: true }
  | { ok: false; code: "unsupported_type" | "too_large"; message: string };

/** Advisory only — server validation is authoritative. */
export function validateSelectedFile(file: File | null): ClientValidationIssue {
  if (!file) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "Choose a PDF resume before converting.",
    };
  }

  const name = file.name.toLowerCase();
  const looksPdf =
    name.endsWith(".pdf") ||
    file.type === "application/pdf" ||
    file.type === "application/x-pdf";

  if (!looksPdf) {
    return {
      ok: false,
      code: "unsupported_type",
      message: messageForErrorCode("unsupported_type"),
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: messageForErrorCode("too_large"),
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      code: "unsupported_type",
      message: "This file appears empty. Choose a valid PDF resume.",
    };
  }

  return { ok: true };
}
