---
type: story
id: US-002
title: Server-side PDF validation
status: done
priority: P0
epic: "[[E02 Job Platform]]"
requirement: R01
spec: "[[SPEC-WORKER]]"
assignee_role: backend-developer
plan_week: week-2
estimate: M
depends_on: ['US-003']
tags:
  - story
  - p0
  - backend
aliases:
  - US-002
---

# US-002 Server-side PDF validation

As the service, I want to reject unsupported files on the server so forged MIME types cannot enter the conversion queue.

## Links

- Epic: [[E02 Job Platform]]
- Requirement: R01 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-003]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Files over 10 MiB, 0 pages, or more than 5 pages are rejected with exact limits.
- [x] Encrypted, corrupt, non-PDF signatures, and image-only PDFs are rejected before conversion.
- [x] MIME type or extension alone is never sufficient to accept a file.
- [x] A4 and US Letter within raster/geometry caps are accepted.

## Implementation notes

Client checks are advisory. See [[Supported Files and Limits]] and [[Failure Catalog]].

Validation runs in `POST /api/jobs/{id}/complete-upload` **before** stub enqueue (`uploading` → `queued`, or `uploading` → `failed`). Node spawns the PyMuPDF inspect CLI at `workers/convert/inspect/inspect_pdf.py` (US-070 threshold: fewer than 80 non-whitespace chars/page → `scan_detected`). No pdf2docx, no OCR. MIME/extension never accept. Object size checked via storage `getObjectSize` before inspect.

## Evidence

- Reviewer: **code-reviewer** — signed 2026-10-03 — **PASS** (no Critical). Status remains `in-review` pending QA / Done gate. Kanban not moved by reviewer (orchestrator instruction).
- Tests / fixtures: Reviewer re-ran `cd apps/web && npm test` → **18/18 passed** (2026-10-03), including `tests/pdf-validation.test.ts` (10 cases). Synthetic fixtures under `workers/convert/inspect/fixtures/` (`example.test` / NANP `555` only; regenerate via `generate_fixtures.py`).
- Claim check against [[Claims and Non Goals]]: no OCR path; no pixel/ATS/perfect-layout claims; scan path fails closed with `scan_detected`; no resume text stored in DB/logs/inspect JSON.
- Deferred (explicit): real SQS enqueue/leases ([[US-012]] — stub queue after validation OK); conversion worker ([[US-010]]/[[US-013]]); portfolio edge-case corpus expansion; S3 temp materialization for non-filesystem adapters; ADR-003 license before publishing a worker image (not accepted here).

### Review (code-reviewer)

| Severity | Finding | Verdict |
|---|---|---|
| Critical | Conversion (pdf2docx) in request handler | None — inspect-only spawn; no pdf2docx |
| Critical | Silent OCR / empty or image-only success | None — image-only → `scan_detected` before queue |
| Critical | MIME/extension alone accepts | None — `%PDF` signature + PyMuPDF gates |
| Critical | Failed validation still enqueues | None — `failValidation` → `failed` before stub `queued` |
| Critical | Resume text in DB/logs/inspect JSON | None — buckets/codes/warnings only; banned text keys stripped |
| Critical | Fake ADR-003 license acceptance | None — ADR stays recommended; no shippable worker image |
| Warning | Customer-reachable deploy of this PyMuPDF inspect sidecar is still AGPL/commercial-relevant SaaS use; ADR-003 must be accepted before public exposure. Packaging today is local CLI (`inspect/` + `requirements.txt`), not a worker Docker image — OK for US-002. | Warn |
| Warning | Portfolio and >20 MP geometry paths are implemented but not covered by `pdf-validation.test.ts`. | Warn |
| Suggestion | `_within_common_page_size` always returns `True` (dead helper); either enforce a real size policy or drop it. | Suggest |
| Suggestion | Add portfolio / oversized-page fixtures when expanding corpus. | Suggest |

**US-012 unlock after Done:** Yes — once US-002 is Done, Kickoff sequencing (`US-003` → `US-002` → `US-012`) and [[US-012]] `depends_on` (`US-003`, `US-072`, both already Done) allow the orchestrator to Ready US-012. Do **not** start US-012 from this review; leave US-002 `in-review` until QA/Done. ADR-003 remains unaccepted (blocks worker image / [[US-010]], not US-012 queue work).

### Code map

| Code | When |
|---|---|
| `too_large` | over 10 MiB (413) |
| `too_many_pages` | over 5 pages (400) |
| `corrupt` | 0 pages, unreadable/truncated PDF (400) |
| `unsupported_type` | non-`%PDF` signature, portfolio, geometry over 20 MP (415 / 400) |
| `encrypted` | `is_encrypted` / `needs_pass` (400) |
| `scan_detected` | any page under 80 non-whitespace chars (400) |
