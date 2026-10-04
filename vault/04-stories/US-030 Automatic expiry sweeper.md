---
type: story
id: US-030
title: Automatic expiry sweeper
status: done
priority: P0
epic: "[[E04 Privacy Deletion]]"
requirement: R05
spec: "[[SPEC-STORAGE]]"
assignee_role: backend-developer
plan_week: week-3
estimate: M
depends_on: ['US-003']
tags:
  - story
  - p0
  - backend
  - privacy
aliases:
  - US-030
---

# US-030 Automatic expiry sweeper

As a user, I want my files to expire automatically so I do not have to remember to delete a resume.

## Links

- Epic: [[E04 Privacy Deletion]]
- Requirement: R05 in [[MVP Priorities]]
- Spec: [[SPEC-STORAGE]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-003]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Access expires 60 minutes after upload completes, or 60 minutes after job creation for abandoned uploads.
- [x] Sweeper runs at least every 5 minutes and targets physical removal within 15 minutes of expiry.
- [x] Expired access returns a neutral unavailable result.

## Implementation notes

Proposed timings. Verify in [[US-093]].

Implemented under `apps/web`:
- `expires_at` set at create (`JOB_ACCESS_TTL_SECONDS`, default 3600) for abandoned uploads; reset on `complete-upload`.
- Callable `runExpirySweeper()` + interval via `ensureExpirySweeperStarted()` / `instrumentation.ts` (`EXPIRY_SWEEP_INTERVAL_SECONDS`, default 300).
- Sweeper: tombstone → delete objects → purge queue/DLQ → mark `deleted` only when objects gone and queue refs drained. Also clears expired leases, reconciles DLQ’d `processing`/`validating`, drains orphan refs after tombstone/terminal (US-012 unlock).
- GET status/download after expiry → `{ error: "expired" }` 410; after verified delete → `unauthorized`.

## Evidence

- Reviewer: code-reviewer (**PASS**, 2026-10-03) + security-engineer (**PASS**, 2026-10-03)
- Tests / fixtures: `cd apps/web && npm test -- tests/expiry-sweeper.test.ts` → **7/7 passed** (re-run 2026-10-03 by code-reviewer). Broader suite previously **44/44**. Coverage: create-window TTL; upload-complete reset; neutral expired status/download; sweeper delete+drain; lease/DLQ reconcile; 5-minute interval config; no resume text in sweep logs.
- Claim check against [[Claims and Non Goals]]: no layout/ATS/OCR/demand claims; no resume text in DB/logs/queue; deletion not reported until object+queue reconcile (lifecycle alone is not proof). Full multi-tier verification remains [[US-032]].
- Deferred: SQS adapter purge semantics; deeper deletion proof ([[US-032]]); user delete UX ([[US-031]]).
- Unlock: [[US-031]] may start after this card reaches **Done** (depends_on US-030 path / shared deletion algorithm).

### Code review (US-030)

- Reviewer: code-reviewer
- Date: 2026-10-03
- Scope: `apps/web/src/lib/jobs/sweeper.ts`, `auth.ts`, `service.ts` (TTL), download/status routes, `instrumentation.ts`, `tests/expiry-sweeper.test.ts` vs [[SPEC-STORAGE]] / [[Deletion Contract]] / AC
- Verdict: **PASS** (no Critical; kanban left unchanged per orchestrator — status remains `in-review`)

| Check | Result |
|---|---|
| 60m access windows | Pass — create sets `expires_at` via `JOB_ACCESS_TTL_SECONDS` (3600); `complete-upload` resets window |
| ≥5 min sweeper | Pass — default `EXPIRY_SWEEP_INTERVAL_SECONDS=300`; started from `instrumentation.ts` (skipped under Vitest) |
| Neutral expired | Pass — GET status/download → `{ error: "expired" }` 410; no DOCX / no secrets; post-`deleted` → `unauthorized` |
| `deleted` before reconcile | Pass — fail-closed after `objectsGone` + live/DLQ drain |
| Resume text / secrets in logs or expiry responses | Pass |
| Expired still serves bytes | Pass — `authorizeJob` gates download before `readDownload` |

Warnings (non-blocking): no negative test that incomplete object/queue cleanup refuses `deleted`; `EXPIRY_SWEEP_INTERVAL_SECONDS` is not clamped to ≤300 (misconfig could miss “at least every 5 minutes”); cleanup-backlog alerting / multipart+temp-disk inventory → [[US-032]].

### Security review (US-030 expiry/deletion path)

- Reviewer: security-engineer
- Date: 2026-10-03
- Scope: `apps/web` sweeper (`src/lib/jobs/sweeper.ts`), authorize/status/download expiry handling (`auth.ts`, GET job + download routes), against [[Deletion Contract]] / [[SPEC-STORAGE]]
- Verdict: **PASS**

| Check | Result |
|---|---|
| Tombstone before cleanup | Pass — `cleanupJob` writes `tombstone=1` + `deleting` (and clears upload/lease tokens) before object delete + queue/DLQ purge |
| Neutral expired / no cross-job disclosure | Pass — secret verified before expiry; wrong/missing secret → `unauthorized`; valid secret past window → `{ error: "expired" }` 410 with no status body or DOCX bytes; after verified `deleted` → `unauthorized` (not a deleted disclosure) |
| No resume text in sweep logs | Pass — sweep events log only `jobId`, prior state, and counts; structured redaction in `logging.ts`; tests assert no PDF/resume text or secret |
| `deleted` only after object+queue reconcile | Pass — fail-closed: `deleted` + `deletion_completed` only when `objectExists` is false for known keys and live+DLQ refs are drained; incomplete cleanup warns and retries |
| Residual → [[US-032]] | Expected — multipart/temp-disk/multi-tier inventory proof; production SQS purge semantics; cleanup-backlog alerting beyond `job_expiry_cleanup_incomplete` warn |

No launch blockers for this story path. Do not claim legal compliance.
