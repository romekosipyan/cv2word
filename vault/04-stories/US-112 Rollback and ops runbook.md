---
type: story
id: US-112
title: Rollback and ops runbook
status: in-review
priority: P0
epic: "[[E09 Beta and Launch]]"
requirement: R06
spec: "[[Architecture]]"
assignee_role: release-manager
plan_week: week-6
estimate: S
depends_on: ['US-043']
tags:
  - story
  - p0
  - ops
aliases:
  - US-112
---

# US-112 Rollback and ops runbook

As operations, I want a rehearsed shutdown and rollback so we can stop uploads if isolation or deletion fails.

## Links

- Epic: [[E09 Beta and Launch]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[Architecture]]
- Role: `release-manager` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-6
- Depends on: [[US-043]]
- Board: [[SDLC Kanban]]
- Runbook: [[Rollback and ops runbook]]
- Infra sketch: `infra/README.md` (`UPLOADS_DISABLED`, alert table)

## Acceptance criteria

- [x] Runbook covers alert routing, cleanup backlog recovery, support intake, and feature shutdown.
- [x] Shutdown stops new uploads and continues expiry/deletion.
- [x] Rehearsal notes are attached to the story.

## Implementation notes

Canonical playbook: [[Rollback and ops runbook]]. Minimal intake halt hook: `UPLOADS_DISABLED=true` → `assertUploadsEnabled()` on `POST /api/jobs` and incomplete `complete-upload`; returns catalog `queue_full` (SPEC-API). Sweeper + `DELETE` unchanged. Do not paste resume contents into this note. Kanban not edited (orchestrator parallel lane).

## Evidence

- Reviewer:
- Tests / fixtures: `cd apps/web && npm test -- tests/uploads-disabled.test.ts` — **3/3 passed** (create reject under flag; create allowed when unset; DELETE `202` + `runExpirySweeper` while `UPLOADS_DISABLED=true`).
- Claim check against [[Claims and Non Goals]]: Runbook uses honest retry / support boundaries; no ATS, perfect layout, demand, or “production monitoring fully provisioned” claims. CloudWatch/SNS residual remains as in [[US-043]] / `infra/README.md`.
- Paths: `vault/05-implementation/Rollback and ops runbook.md`; `apps/web/src/lib/ops/uploads.ts`; `apps/web/src/lib/config.ts` (`uploadsDisabled`); `apps/web/src/lib/jobs/service.ts` (guards); `apps/web/tests/uploads-disabled.test.ts`; `infra/README.md` (env + link).

### Rehearsal notes (local tabletop — 2026-10-04)

Environment: local Next.js job API + in-process sweeper (`apps/web`), no provisioned CloudWatch/SNS.

| Step | Action | Result |
|---|---|---|
| 1 | Baseline create with `UPLOADS_DISABLED` unset | `POST /api/jobs` → `201`, job + upload auth issued |
| 2 | Enable shutdown `UPLOADS_DISABLED=true` | Process env / config re-read on next request |
| 3 | Confirm intake stopped | `POST /api/jobs` → `503` `{ error: "queue_full", retryAfterSeconds: 3600 }` + `Retry-After: 3600`; log `uploads_disabled_reject` / `reason=uploads_disabled`; no job id/secret |
| 4 | Confirm deletion continues | Authorized `DELETE /api/jobs/{id}` → `202`; `runExpirySweeper` completes (`expiry_sweep_completed`, `markedDeleted` path exercised in test) |
| 5 | Alert routing dry-run | Mapped US-043 names from `infra/README.md` to runbook severity/first-response table; noted CloudWatch/SNS **not** provisioned — log-tail paging only |
| 6 | Support intake dry-run | Walked accept/never-accept lists; escalation to shutdown for isolation/deletion themes; no resume attachments |
| 7 | Cleanup backlog dry-run | Walked [[Deletion Contract]] tier order against runbook recovery steps; lifecycle not treated as proof |
| 8 | Clear flag | `UPLOADS_DISABLED=false` / unset restores creates (covered by “allows create when unset” test) |

**Gaps / residuals (non-blocking for story AC):** production SNS page rotation and named beta on-call mailbox; public contact route still [[US-111]]; convert-worker scale-to-zero drain is optional ops step documented, not automated.
