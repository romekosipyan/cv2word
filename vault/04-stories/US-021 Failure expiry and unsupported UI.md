---
type: story
id: US-021
title: Failure expiry and unsupported UI
status: done
priority: P0
epic: "[[E05 Converter UI]]"
requirement: R03
spec: "[[SPEC-UI]]"
assignee_role: frontend-developer
plan_week: week-3
estimate: M
depends_on: ['US-004']
tags:
  - story
  - p0
  - frontend
aliases:
  - US-021
---

# US-021 Failure expiry and unsupported UI

As a user, I want actionable failure and expiry screens so I know what to do next without seeing parser internals.

## Links

- Epic: [[E05 Converter UI]]
- Requirement: R03 in [[MVP Priorities]]
- Spec: [[SPEC-UI]]
- Role: `frontend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-004]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Each [[Failure Catalog]] code has a user-facing message and a next action.
- [x] Expired or unauthorized access is a neutral unavailable state plus a fresh upload action.
- [x] Lost credentials cannot be recovered by email.
- [x] Processing always exits; no indefinite spinner.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

## Evidence

- Reviewer: **code-reviewer — PASS** (2026-10-03). Catalog mapping complete; expired/unauthorized share neutral unavailable copy + fresh upload; no email recovery; poll wall-clock + consecutive-transient budgets force exit; no forbidden claims / secrets-in-URL / verified-deletion claims. Left `status: in-review` for QA. Did not edit kanban.
- Tests / fixtures: `cd apps/web && npm test -- tests/converter-failures.test.ts tests/converter-messages.test.ts tests/converter-stages.test.ts` → **15/15 passed** (re-run by code-reviewer). New `tests/converter-failures.test.ts` covers all Failure Catalog codes (message + next action), shared unavailable copy for `expired`/`unauthorized`, no-email credential note, claim-safe copy, retry timing, and poll exit (wall-clock + consecutive transient budget). Browser check on `localhost:3000`: PNG advisory rejection; mocked `expired` create → **Job unavailable** panel with next action, email non-recovery note, **Choose another PDF**, URL stayed `/` (no secrets).
- Claim check against [[Claims and Non Goals]]: Required fidelity warning unchanged. No perfect-layout / 100% / ATS / pixel-identical / verified-deletion / invented-% copy in failure catalog strings. OCR explicitly not available yet for `scan_detected`. No account/email recovery path.
- Review notes (non-blocking): `FailurePanel` still sets `data-error-code` to `expired` vs `unauthorized` (user-visible title/message/nextAction identical). Prefer a shared unavailable code in DOM if distinguishing causes must stay invisible to inspectors.
- **QA Evidence: PASS** (2026-10-03, qa-engineer). Re-ran `cd apps/web && npm test -- tests/converter-failures.test.ts tests/converter-messages.test.ts tests/converter-stages.test.ts` → **15/15 passed**. Browser on `http://localhost:3000/`: (1) PNG advisory → “Only PDF files are supported…”; (2) mocked create `expired` → **Job unavailable** + next action + “Lost access cannot be recovered by email…” + **Choose another PDF**, URL stayed `/`, spinner exited; (3) mocked create `unauthorized` → same user-visible unavailable copy/next action/credential note, spinner exited (`data-error-code` still `expired`/`unauthorized` — non-blocking, matches code-reviewer note). AC: catalog message+next action; neutral unavailable + fresh upload; no email recovery; processing always exits. Claim check: no forbidden layout/ATS/% claims in failure surfaces. Did not edit kanban. Set `status: done`, restored `assignee_role: frontend-developer`.
