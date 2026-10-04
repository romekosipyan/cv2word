import { MAX_PAGES, MAX_UPLOAD_BYTES, MIN_PAGES } from "./pdf/limits";

export const MAX_UPLOAD_MIB = MAX_UPLOAD_BYTES / (1024 * 1024);

export const FIDELITY_WARNING =
  "Formatting may change. Review your resume after conversion.";

export const PRIMARY_CTA = "Convert resume to Word";

export const SUPPORTED_SUMMARY = `PDF only · ${MIN_PAGES}–${MAX_PAGES} pages · up to ${MAX_UPLOAD_MIB} MiB`;

export const PRIVACY_SUMMARY =
  "Anonymous conversion — no account, email, or checkout. We process your file only to convert it; we do not use resume text for training, ads, or profiling. Jobs expire automatically, and you can delete your files sooner. Closing this tab does not delete the job instantly.";
