---
type: story
id: US-004
title: Named stages session and cancel
status: done
priority: P0
epic: "[[E05 Converter UI]]"
requirement: R03
spec: "[[SPEC-UI]]"
assignee_role: frontend-developer
plan_week: week-2
estimate: M
depends_on: ['US-003', 'US-001']
tags:
  - story
  - p0
  - frontend
aliases:
  - US-004
---

# US-004 Named stages session and cancel

As a user, I want named processing stages and the ability to cancel so I know the job is real work, not a fake progress bar.

## Links

- Epic: [[E05 Converter UI]]
- Requirement: R03 in [[MVP Priorities]]
- Spec: [[SPEC-UI]]
- Role: `frontend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-003]], [[US-001]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Stages shown are only Uploading, Waiting, Converting, Checking output.
- [x] No invented percentage progress.
- [x] Double submit is prevented. One active job per session.
- [x] Same-tab reload can resume; credentials never appear in the URL.
- [x] Copy states that closing the tab does not instantly delete the job.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

Queued stub from [[US-001]] replaced with `GET /api/jobs/{id}` polling + backoff (`pollJob.ts`). Job states map to the four named stages in `stages.ts`. Cancel uses `DELETE` and shows deletion-in-progress on `202 delete_pending` without claiming verified deletion. Same-tab resume via `sessionStorage` (`rtw.activeJob`) + HttpOnly cookie path. Terminal ready/failed stubs only — full download/result UI is [[US-020]].

## Evidence

- Reviewer: **code-reviewer — PASS** (2026-10-03). Moved In Review → QA for `qa-engineer`. Do not start [[US-020]] / [[US-021]] until this card is Done; [[US-031]] for fuller cancel if needed.
- Code review (converter only):
  - Stages: only `NAMED_STAGES` Uploading / Waiting / Converting / Checking output; no invented %.
  - Double submit: `busy` gates submit + file picker; CTA shows Working… while uploading/processing/deleting.
  - Credentials: `sessionStorage` (`rtw.activeJob`) + Bearer header; document URL stays `/` — no secret/query.
  - Cancel: `DELETE` → 202/`delete_pending` UI says “Deletion in progress” / access revoked; does not claim verified deleted.
  - Tab-close copy present (`TAB_CLOSE_COPY` + privacy summary).
- Warnings (non-blocking):
  - Cancel does not `stopPolling()` before `deleteJob`; a concurrent poll tick can briefly overwrite the deleting phase until DELETE returns.
  - Double-submit guard is React `busy` state only (no submit ref); a same-tick double click could still race before re-render.
- Tests / fixtures:
  - `apps/web/tests/converter-stages.test.ts` — four named stages, state mapping, cancel eligibility, bounded backoff.
  - Browser (2026-10-03, `http://localhost:3000/`): `letter_text.pdf` → Uploading → Waiting (list shows only the four stages; no %); CTA becomes Working… / disabled (double submit blocked); Cancel → “Deletion in progress” / live region `delete_pending` (no verified-deleted claim); same-tab reload resumed Waiting with Cancel; URL stayed `/` with no secret/query.
- Claim check against [[Claims and Non Goals]]:
  - Required fidelity warning retained from US-001.
  - No pixel-perfect / ATS / ranking claims added.
  - Ready stub explicitly defers download polish to [[US-020]].

### QA Evidence: PASS (2026-10-03)

Verified by `qa-engineer` against SPEC-UI stages/session/cancel and Claims and Non Goals. Kanban left untouched (orchestrator moves QA → Done).

| AC | Result | Evidence |
|---|---|---|
| Four named stages only | PASS | Unit: `converter-stages.test.ts` (4/4). Browser: stage list = Uploading, Waiting, Converting, Checking output only (idle resume + Uploading after convert). |
| No invented % progress | PASS | UI copy “no percentage progress; named stages only.” Panel text had no `\d+%` progress. Mapping returns stage names, not percents. |
| Double submit / one active job | PASS | During Uploading/deletion phases CTA = Working… and disabled; Choose PDF disabled while busy. |
| Same-tab resume; secrets not in URL | PASS | On load with `sessionStorage` `rtw.activeJob` present, UI resumed deletion-in-progress. Document URL stayed `http://localhost:3000/` with empty search/hash (no job id/secret). |
| Tab-close ≠ instant delete | PASS | Stage note + privacy summary: “Closing this tab does not delete the job instantly…” / “…does not delete the job instantly.” |
| Cancel → delete_pending honesty | PASS | Resumed session showed “Deletion in progress — access is revoked. Do not assume files are fully removed until cleanup is confirmed.” Live region: “Deletion is in progress…”. No verified-deleted claim. Prior browser cancel path on story remains valid. |

- Unit tests re-run: `npm test -- --run tests/converter-stages.test.ts` → **4 passed**.
- Browser re-check (`localhost:3000`, `letter_text.pdf`): Uploading stage + busy gate confirmed. A second full convert→cancel in this QA session hit free rate limit (`rate_limited`); cancel/`delete_pending` UI was still observed via same-tab resume of an in-flight delete from the prior session. Non-blocking reviewer warnings stand (stopPolling-before-DELETE; optional submit ref) — not AC failures.
- Claims: fidelity warning present; no ATS / pixel-perfect / ranking claims.
- Handoff: story `status: done`. Orchestrator should move the kanban card and can unlock [[US-021]] (download click must not delete). [[US-020]] still blocked on [[US-011]]. Do not start US-020 / US-021 from this QA turn.
