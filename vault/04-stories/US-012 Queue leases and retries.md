---
type: story
id: US-012
title: Queue leases and retries
status: done
priority: P0
epic: "[[E02 Job Platform]]"
requirement: R02
spec: "[[SPEC-API]]"
assignee_role: backend-developer
plan_week: week-2
estimate: L
depends_on: ['US-003', 'US-072']
tags:
  - story
  - p0
  - backend
aliases:
  - US-012
---

# US-012 Queue leases and retries

As the platform, I want leased queue dispatch so a crashed worker cannot publish stale state or duplicate outputs.

## Links

- Epic: [[E02 Job Platform]]
- Requirement: R02 in [[MVP Priorities]]
- Spec: [[SPEC-API]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-003]], [[US-072]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Queue messages carry job references only, never document bytes or bearer secrets.
- [x] A worker may publish state only while it holds a current lease and no tombstone exists.
- [x] Infrastructure failures retry once. Validation failures do not retry as infra.
- [x] Repeated complete-upload or worker retry completes one logical job and counts quota once.

## Implementation notes

See [[Job State Machine]].

Implemented under `apps/web` (local-dev stand-in for ADR-002 SQS). `JobQueue` interface shaped for SQS visibility timeout = lease; `InMemoryJobQueue` for tests/dev (at-least-once, maxReceiveCount=2 → DLQ). `complete-upload` (after US-002 validation) enqueues `{ jobId, outputObjectKey }` only — never secrets or document bytes. Sticky destination key `outputs/{jobId}/resume-editable.docx` prevents forked outputs under redelivery. Worker publish gated by `acquireWorkerLease` / `publishWorkerState` (live lease + no tombstone). Simulated worker client `processOneSimulatedJob` (no pdf2docx) exercises infra retry-once vs validation terminal. Quota still counted once at create; duplicate complete-upload is idempotent. No worker image published; US-010 conversion not implemented.

## Evidence

- Reviewer: **code-reviewer** — signed 2026-10-03 — **PASS** (no Critical). Status remains `in-review` pending QA / Done gate. Kanban not moved by reviewer (orchestrator instruction).
- Tests / fixtures: Reviewer re-ran `cd apps/web && npm test` → **27/27 passed** (2026-10-03), including `tests/queue-leases.test.ts` (7): payload reference-only; lease required to publish; tombstone blocks publish; one infra retry then `conversion_failed`; validation `output_invalid` not requeued; duplicate complete-upload → one queue message + `quota_counted=1`; success path sticky destination key.
- Claim check against [[Claims and Non Goals]]: no layout/ATS/OCR/demand claims; no conversion in request handlers; no resume text on queue/DB/logs; no public worker image in this story.
- Deferred (explicit): real AWS SQS adapter (same `JobQueue` interface); pdf2docx conversion ([[US-010]]); worker image / isolation ([[US-013]], blocked on ADR-003); capacity reject ([[US-041]]).

### Code review (US-012)

| Severity | Finding | Verdict |
|---|---|---|
| Critical | Secrets or document bytes on queue | None — payload `{ jobId, outputObjectKey }` only; `assertSafeQueuePayload` rejects extra fields / oversized bodies |
| Critical | Publish without lease or after tombstone | None — `publishWorkerState` requires live lease token; tombstone returns `tombstone` and blocks |
| Critical | Validation failures retried as infra | None — validation path deletes message and terminals `failed`; not `release`d |
| Critical | Duplicate outputs / double quota | None — sticky `outputs/{jobId}/resume-editable.docx`; enqueue idempotent by `jobId`; quota counted once at create |
| Critical | Conversion in request handler / pdf2docx | None — `complete-upload` validates+enqueues only; `processOneSimulatedJob` has no pdf2docx |
| Critical | Public worker image published | None — not in scope; ADR-003 gate untouched |
| Warning | Idempotent `complete-upload` on `succeeded` re-enqueues a ghost message | Drain relies on `skipped_terminal`; skip enqueue for terminal states |
| Warning | `acquireWorkerLease` is check-then-update (no optimistic lease CAS) | Fine for single-thread local SQLite; production workers need compare-and-swap on `lease_token` |
| Warning | `lease_held` leaves message in-flight and can burn receive count toward DLQ | Job can sit non-terminal after DLQ until sweeper ([[US-030]]) |
| Suggestion | No visibility/lease heartbeat in sim | OK under 120s ADR cap; [[US-010]]/[[US-013]] should extend visibility with the lease |
| Suggestion | In-memory queue is ADR-002 stand-in only | SQS adapter still deferred; at-least-once warning from [[US-072]] is addressed via lease + sticky key + tombstone |

### Unlock notes

- **[[US-030]] Automatic expiry sweeper:** Reconcile expired leases, `processing`/`validating` rows whose queue message hit DLQ, and drain orphan queue/DLQ references after tombstone or terminal. Do not treat lifecycle alone as deletion proof.
- **[[US-031]] User delete and cancel:** Tombstone → publish block is in place and tested; cancel/delete while leased should keep using tombstone-first. Ensure DELETE still revokes access immediately even if a queue message remains until sweeper/worker drain.
