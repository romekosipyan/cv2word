import { MAX_PAGES, MAX_UPLOAD_BYTES, MIN_PAGES } from "./pdf/limits";

export const MAX_UPLOAD_MIB = MAX_UPLOAD_BYTES / (1024 * 1024);

export const FIDELITY_WARNING =
  "Formatting may change. Review your document after conversion.";

export const PRIMARY_CTA = "Choose your PDF resume";

export const CONVERT_CTA = "Convert for free preview";

export const SUPPORTED_SUMMARY = `PDF only · ${MIN_PAGES}–${MAX_PAGES} pages · up to ${MAX_UPLOAD_MIB} MiB · $1.99 USD / download`;

export const TEXT_PDF_NOTE =
  "Works with text-based PDFs, such as a resume exported from Word or Google Docs. Scanned or photographed resumes aren't supported.";

export const PRIVACY_SUMMARY =
  "ResumeToWord runs the conversion inside your browser — your PDF isn't sent to our servers. We do not use document text for training, ads, or profiling. Payment for download is handled by Stripe.";

export const HERO_TRUST_BULLETS = [
  "Your CV stays on this device",
  "No account, no email",
  "Free preview before you pay",
] as const;
