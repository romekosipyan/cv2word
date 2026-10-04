---
type: story
id: US-031
title: User delete and cancel
status: done
priority: P0
epic: "[[E04 Privacy Deletion]]"
requirement: R05
spec: "[[SPEC-STORAGE]]"
assignee_role: backend-developer
plan_week: week-3
estimate: M
depends_on: ['US-030', 'US-012']
tags:
  - story
  - p0
  - backend
  - privacy
aliases:
  - US-031
---

# US-031 User delete and cancel

As a user, I want to cancel a job or delete my files immediately so the service stops holding my resume.

## Links

- Epic: [[E04 Privacy Deletion]]
- Requirement: R05 in [[MVP Priorities]]
- Spec: [[SPEC-STORAGE]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-030]], [[US-012]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] DELETE revokes access immediately and returns 202 while cleanup is pending.
- [x] UI must not claim deleted until verification. See [[US-032]].
- [x] Cancel while queued or processing writes a tombstone; workers halt and do not publish a result.
- [x] Download is not deleted merely because a download was initiated.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

Implemented under `apps/web`:
- `requestDelete`: tombstone + `deleting`, clear upload tokens and worker lease, log `priorState` only, schedule async cleanup (`scheduleUserDeletionCleanup` → `reconcileUserDeletion`, skipped under Vitest for determinism).
- Reuses US-030 object delete + queue/DLQ purge; `deleted` + `deletion_completed` only after object+queue reconcile.
- GET status → `delete_pending` 202 while pending; after verified delete → `unauthorized`. Download route never calls delete.
- UI contract (US-004 + `jobApi.deleteJob`): 202/`delete_pending` → “Deletion in progress”; must not claim verified deleted (US-032 owns multi-tier proof).
- Worker-sim: tombstone after mid-work drops queue ref and returns `skipped_tombstone` (no success publish).

## Evidence

- Reviewer: **code-reviewer → PASS** (2026-10-03); **security-engineer → PASS** (2026-10-03). Status remains `in-review` (kanban not edited).
- Tests / fixtures: `cd apps/web && npm test -- tests/user-delete-cancel.test.ts` → **8/8 passed** (re-run 2026-10-03 by code-reviewer; security re-run **8/8**). Related: `expiry-sweeper` 7/7, `queue-leases` 7/7, `jobs-api` 8/8 (30/30 combined). Coverage: immediate 202 revoke; idempotent DELETE; cancel queued/processing tombstone+no publish; download ≠ delete; reconcile marks `deleted` only when clean; sweeper finishes pending user deletes; no secret/PDF text in delete logs.
- Claim check against [[Claims and Non Goals]]: no layout/ATS/OCR/demand claims; no resume text in DB/logs/queue; UI/API must not claim deleted until verification.
- Residual → [[US-032]]: multipart uploads, temp disks, full multi-tier inventory proof, cleanup-backlog alerts, production SQS purge semantics, storage-level block on post-tombstone `putObject` recreation.
- Unlock: [[US-032]] may start after this card reaches **Done**. Do not start [[US-010]] (ADR-003 blocked).
- Code-review notes (non-blocking): `publishWorkerState` / `updateJob` are read-modify-write without `WHERE tombstone = 0`; safe in single-process sync Node today, harden with conditional UPDATE before multi-writer workers.

### Security review (US-031 user delete / cancel)

- Reviewer: security-engineer
- Date: 2026-10-03
- Scope: `apps/web` DELETE path (`api/jobs/[id]/route.ts`, `requestDelete`), tombstone + lease clear (`service.ts`, `auth.ts`, `lease.ts`), worker skip (`worker-sim.ts`), reconcile (`sweeper.ts` `reconcileUserDeletion` / `cleanupJob`), UI honesty (`jobApi.deleteJob`, converter `delete_pending` copy) against [[Deletion Contract]] / [[SPEC-STORAGE]]
- Verdict: **PASS**
- Status left `in-review` (kanban not edited)

| Check | Result |
|---|---|
| Immediate access revoke on DELETE | Pass — `requestDelete` sets `tombstone=1` + `deleting`, clears upload tokens and worker lease before async cleanup; GET status → `delete_pending` 202; download remaps auth failure to neutral unavailable (no bytes) |
| Tombstone before async cleanup | Pass — tombstone written synchronously in `requestDelete`; `scheduleUserDeletionCleanup` / sweeper only then delete objects and purge queue/DLQ |
| Workers must not publish after cancel | Pass — `acquireWorkerLease` / `publishWorkerState` refuse tombstone; worker-sim returns `skipped_tombstone` and drops queue ref; tests cover queued + mid-processing cancel |
| `deleted` only after object+queue reconcile | Pass — `cleanupJob` fail-closed: `deleted` + `deletion_completed` only when `objectsGone` and live+DLQ refs drained; incomplete → warn, stay `deleting` |
| No resume text / secrets in delete logs | Pass — `job_delete_pending` logs `jobId` + `priorState` only; structured redaction; test asserts no secret / `%PDF` / resume text |
| UI must not claim verified deleted | Pass — API/UI stay on `delete_pending` / “Deletion in progress”; `jobApi.deleteJob` never returns a verified-deleted signal |
| Download ≠ delete | Pass — download route never calls `requestDelete`; objects remain after download |

**Residuals → [[US-032]] (non-blocking for this story):** multipart uploads, temp disks, full multi-tier inventory proof, cleanup-backlog alerts, production SQS purge semantics, storage-level block on post-tombstone `putObject` recreation. Agrees with code-reviewer: optional conditional `UPDATE … WHERE tombstone = 0` on worker publish before multi-writer workers.

No launch blockers for this story path. Do not claim legal compliance.
