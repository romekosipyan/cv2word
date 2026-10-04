---
type: story
id: US-001
title: Landing upload with warnings
status: done
priority: P0
epic: "[[E05 Converter UI]]"
requirement: R01
spec: "[[SPEC-UI]]"
assignee_role: frontend-developer
plan_week: week-2
estimate: M
depends_on: ['US-002']
tags:
  - story
  - p0
  - frontend
aliases:
  - US-001
---

# US-001 Landing upload with warnings

As a job seeker, I want to choose one PDF on the landing page and start conversion without creating an account.

## Links

- Epic: [[E05 Converter UI]]
- Requirement: R01 in [[MVP Priorities]]
- Spec: [[SPEC-UI]]
- Role: `frontend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-002]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Upload surface states supported files, limits, privacy summary, and the required fidelity warning.
- [x] Primary action is Convert resume to Word. Choosing a file does not start conversion by itself.
- [x] No email, sign-up, or checkout interrupts the flow.
- [x] Client validation is advisory; server rejection is shown with the exact limit.

## Implementation notes

Drag-and-drop is optional. Keyboard picker is required. See [[UX Contract]].

Landing marketing copy is SSR in `apps/web/src/app/page.tsx`. Converter loads progressively via `ConverterIsland` (`dynamic`, `ssr: false`). Explicit CTA wires `POST /api/jobs` → upload PUT → `POST /api/jobs/{id}/complete-upload`. Job secret stays in HttpOnly cookie + `sessionStorage` (`rtw.activeJob`); never in the URL. Post-queue stage machine / download / cancel deferred to [[US-004]] (queued stub only).

Local upload PUT now falls back to SQLite `upload_token_hash` when the in-memory ticket map is empty (Next.js route module split in `next dev`).

## Evidence

- Reviewer: code-reviewer — **PASS** (2026-10-03). Status remains `in-review` (kanban unchanged this turn). After Done, [[US-004]] unlocks.
- Code review (US-001 scope only):
  - Critical: none.
  - Warning: processor/region/contact notice still deferred to [[US-111]] (launch gate; not an US-001 AC fail — privacy summary on upload surface is present).
  - Suggestion: add a sync in-flight guard in `runConvert` so a double-click before `busy` re-renders cannot start two creates; XSS risk of `sessionStorage` job secret is accepted for same-tab resume (HttpOnly cookie remains primary).
- Block checks: no secrets in URLs (upload token in `Authorization` header; job secret Bearer/cookie only); no account/email/checkout wall; file select does not auto-start; required fidelity warning present; no forbidden claims; no pdf2docx/OCR in Next.js handlers (`completeUploadAsync` validates + enqueues only).
- Tests / fixtures:
  - `apps/web/tests/converter-messages.test.ts` — exact-limit messages + advisory client validation (vitest PASS, 2026-10-03).
  - Browser (2026-10-03, `http://localhost:3000/`): fidelity warning + limits + privacy summary present; Choose PDF / Convert resume to Word; CTA disabled until file; selecting file does not auto-start; oversized file shows `10 MiB` / `10,485,760 bytes`; convert of `letter_text.pdf` → Uploading → Waiting → queued stub (US-004 deferred); URL remained `/` with no secret/query; no account/email/checkout UI.
  - API smoke: create → PUT → complete-upload → `queued`; upload URL did not contain job secret.
- Claim check against [[Claims and Non Goals]]:
  - Required warning present: “Formatting may change. Review your resume after conversion.”
  - No perfect-layout / ATS / accuracy claims.
  - Privacy summary states anonymous processing, no training/ads/profiling, automatic expiry; full processor/region notice remains [[US-111]].
