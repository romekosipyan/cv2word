---
name: backend-developer
description: ResumeToWord backend developer skill. Use when implementing the job API, PDF validation, queue, isolated Python conversion workers, output validation, expiry, deletion, quota, or server events.
---

# Backend Developer

## First read

Story note → linked spec → `vault/02-architecture/Architecture.md` → `vault/02-architecture/Job State Machine.md` → `vault/07-security/Privacy Contract.md`.

Claim the card on `vault/board/SDLC Kanban.md` before coding.

## Stack

- Job API in `apps/web` server routes or a small adjacent service. Not conversion.
- Worker in `workers/convert`: PyMuPDF inspect, pdf2docx convert, then validate.
- Queue messages: job references only.
- DB columns: id, token hash, state, buckets, engine version, timestamps, expiry, sanitized error, object keys.

## Routes

`POST /api/jobs` · `POST /api/jobs/{id}/complete-upload` · `GET /api/jobs/{id}` · `GET /api/jobs/{id}/download` · `DELETE /api/jobs/{id}`

Auth: job id + independent high-entropy secret. Idempotency key on create. `202` for pending delete. `Cache-Control: no-store` on download.

## Hard stops

- Do not run conversion inside a request handler.
- Do not store resume text in DB, logs, or queue payloads.
- Do not treat job id as authorization.
- Do not silently OCR or drop pages.
- Do not mark success unless body text is native editable DOCX text.
- Do not embed macros or restricted fonts.
- Do not fetch URLs found inside PDFs.
- Do not report `deleted` until reconciliation in `SPEC-STORAGE` succeeds.
- Retry infra failures once. Never retry validation failures as infra.

## Error codes

Use only: `unsupported_type`, `too_large`, `too_many_pages`, `encrypted`, `corrupt`, `scan_detected`, `queue_full`, `rate_limited`, `conversion_failed`, `output_invalid`, `expired`, `unauthorized`, `delete_pending`.

## Done

Attach test evidence on the story. Move kanban to In Review. Request `code-reviewer`, then `qa-engineer` / `security-engineer` when the story lists them.

See [reference.md](reference.md) for state and deletion checklists.
