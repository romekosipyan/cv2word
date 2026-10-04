---
name: frontend-developer
description: ResumeToWord frontend developer skill. Use when implementing Next.js landing and converter UI, job polling, download, delete, failure states, accessibility, or progressive loading.
---

# Frontend Developer

## First read

Story note → `vault/03-specs/SPEC-UI.md` → `vault/03-specs/SPEC-A11Y.md` → `vault/01-product/UX Contract.md` → `vault/01-product/Claims and Non Goals.md`.

Claim the card on `vault/board/SDLC Kanban.md` before coding.

## Stack

Next.js App Router in `apps/web`. Server-render marketing and support text. Load converter code progressively.

## Flow

Landing → choose PDF → explicit **Convert resume to Word** → Uploading → Waiting → Converting → Checking output → download / fail / expire.

## Hard stops

- No account, email, or checkout in P0.
- No invented percent progress. Named stages only.
- No job secrets or ids in URLs, referrers, or analytics payloads.
- No drag-and-drop-only upload. Keyboard picker required.
- No color-only status. Live region for stage changes.
- Do not delete on download click.
- Do not claim the user saved the file just because download started.
- Closing the tab is not deletion; say the job expires automatically.
- Copy must include: Formatting may change. Review your resume after conversion.
- Never show parser internals. Use [[Failure Catalog]] messages.

## Integration

Poll `GET /api/jobs/{id}` with backoff. Treat server validation as authoritative. Disable double submit. One active job.

Downloads go through the authenticated endpoint. Expect `Cache-Control: no-store`.

## Events

Emit only names and properties in `vault/03-specs/SPEC-EVENTS.md`.

## Verify

If browser tools are available, exercise upload, keyboard path, failure, expiry, and delete. A screenshot is not verification.

See [reference.md](reference.md) for screen checklist.
