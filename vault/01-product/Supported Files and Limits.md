---
type: product
tags:
  - product
  - limits
aliases:
  - Supported Files and Limits
---

# Supported files and operating limits

Initial product limits. Confirm by load and fidelity testing. Enforce byte and page limits on the server regardless of client checks or claimed content type.

| Property | P0 contract | P1 OCR proposal |
|---|---|---|
| Input | PDF only; signature and parseability checked | PDF only; scans or mixed pages |
| Output | DOCX with editable body text | DOCX with recognized editable text |
| Size | 10 MiB maximum uploaded bytes | 10 MiB |
| Pages | 1 to 5; benchmark core is 1 to 3 | 1 to 3 initially |
| Language | English UI; Latin script test scope | English OCR language initially |
| Layout | Single column baseline; two columns best effort | Simple reading-order reconstruction |
| Unsupported | Encrypted, corrupt, image-only, portfolio PDFs | Encrypted, corrupt, handwriting |
| Concurrency | One active job per anonymous session | One active job; bounded OCR pool |
| Runtime cap | 120 seconds of worker execution | 180 seconds |
| Free quota | **3 jobs per 24 hours per anonymous session** ([[ADR-007 Free Quota]] accepted) | Validate quota and availability |

## Boundary handling

- Accept common page sizes including A4 and US Letter, within raster and geometry safety caps.
- Reject zero-page documents and files exceeding limits.
- JPG, PNG, HEIC, DOC, and DOCX input are outside the initial contract.
- MIME type or file extension alone is insufficient validation.

## Mixed and scanned PDFs

A mixed PDF with image-only pages cannot be marked fully converted in P0. Detect low text density per page, warn that scans may be present, and reject if meaningful content would be omitted. Calibrate detection so sparse legitimate pages are not false-rejected.

## Output integrity

- Default download name: `resume-editable.docx`.
- Sanitize names. Strip source metadata, active content, embedded attachments, unsafe external relationships, and unsupported annotations.
- Never create macros.
- Do not embed restricted fonts; use approved substitutions and warn when they may affect spacing.

See [[SPEC-WORKER]] and [[SPEC-STORAGE]].
