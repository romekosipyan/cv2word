---
type: spec
id: SPEC-WORKER
tags:
  - spec
  - worker
aliases:
  - SPEC-WORKER
---

# SPEC-WORKER — Conversion pipeline

Owner role: [[Backend Developer]]. Isolation review: [[DevOps SRE]], [[Security Engineer]]. Quality: [[QA Engineer]].

## Pipeline

1. **Inspect** with PyMuPDF: signature, page count, encryption, text density per page, geometry safety.
2. **Convert** with pdf2docx to a DOCX that contains native editable body text.
3. **Validate** text completeness heuristics, package structure, macros absent, metadata stripped, no omitted pages.
4. **Publish** output key and warnings only if validation passes.

## Hard rules

- Run outside Next.js request handlers.
- No outbound network from the worker.
- Non-root, read-only base image, per-job temp directory.
- Initial caps to confirm: 1 CPU, 1 GiB RAM, 256 MiB temp disk, 20 megapixels/page, 120s execution.
- Retry once only for infrastructure failures. Never retry validation failures as if they were infra.
- Duplicate output writes must be impossible (lease + destination key + tombstone).
- No silent OCR. P0 image-only or mixed pages that would omit content → `scan_detected` failure.
- Empty or materially incomplete output → block download (`output_invalid`).

## Inspection gates

Reject before conversion: encrypted, corrupt, zero pages, >5 pages, >10 MiB, non-PDF signature, portfolio PDFs, pages exceeding raster/geometry caps.

Warn and continue only when content is still complete: font substitution risk, possible two-column order risk.

## Output integrity

- Default filename `resume-editable.docx`.
- Strip source metadata, active content, embedded attachments, unsafe external relationships, unsupported annotations.
- Never create macros.
- Do not embed restricted fonts. Use approved substitutions. Warn when spacing may change.
- Link schemes allowlist only. Never fetch URLs found inside PDFs.

## Queue

Messages carry job references only. Worker must re-check tombstone and lease before every state publish. See [[Job State Machine]].

## Licensing

Do not ship a worker image until [[ADR-003 PyMuPDF License]] is decided. Pin versions during [[US-070]]. Record whether pdf2docx needs a maintained fork in [[ADR-004 pdf2docx Maintenance]].
