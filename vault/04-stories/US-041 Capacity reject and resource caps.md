---
type: story
id: US-041
title: Capacity reject and resource caps
status: done
priority: P0
epic: "[[E06 Abuse Reliability]]"
requirement: R06
spec: "[[SPEC-WORKER]]"
assignee_role: devops-sre
plan_week: week-3
estimate: M
depends_on: ['US-012', 'US-013']
tags:
  - story
  - p0
  - devops
aliases:
  - US-041
---

# US-041 Capacity reject and resource caps

As operations, I want to reject new jobs when the queue cannot meet a two-minute wait so users are not left on an indefinite spinner.

## Links

- Epic: [[E06 Abuse Reliability]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `devops-sre` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-012]], [[US-013]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] New jobs are rejected with queue_full when bounded wait would exceed two minutes.
- [x] Worker CPU/RAM/disk/time/raster caps are enforced in the runtime.
- [x] No charge and no invented progress percentage.

## Implementation notes

[[Reliability Targets]].

ADR-002 formula: `predicted_wait ≈ (queued + in_flight) × CAPACITY_P50_JOB_SECONDS / max(CAPACITY_READY_WORKERS, 1)`. Reject when `> CAPACITY_MAX_WAIT_SECONDS` (default 120). `CAPACITY_P50_JOB_SECONDS` remains an unmeasured placeholder (not Reliability Targets p95 truth; [[US-092]] measures later).

Product caps vs Fargate platform: 1 CPU / **1 GiB** RSS / 256 MiB tmpfs / 20 MP / 120s. Fargate task memory stays **2 GiB** at 1 vCPU; do not raise product `WORKER_MEMORY_MIB` to 2048.

## Evidence

- Reviewer: **code-reviewer — PASS** (2026-10-03). Status left `in-review` (orchestrator / QA next; kanban not edited). Implementation by devops-sre.
- Caps matrix (confirmed in docs + entrypoint harden):
  | Control | Value | Where |
  |---|---|---|
  | CPU | 1 | compose `cpus`, ECS `1024`, entrypoint refuse `>` |
  | Product RAM | 1 GiB | compose `mem_limit: 1g`, `WORKER_MEMORY_MIB=1024`, cgroup `memory.max` when writable |
  | Fargate platform RAM | 2 GiB | ECS sketch only (minimum at 1 vCPU) |
  | Temp | 256 MiB tmpfs `/mnt/job-tmp` | compose + ECS `linuxParameters.tmpfs` |
  | Raster | 20 MP/page | env + entrypoint refuse `>` |
  | Time | 120s | entrypoint `timeout` (required) |
- Capacity reject:
  - `apps/web/src/lib/capacity/` predictor + `assertCapacityAllowsNewJob` before insert (no quota charge)
  - `POST /api/jobs` → `503` `{ error: "queue_full", retryAfterSeconds }` + `Retry-After`
  - Queue depth via `JobQueue.approximateDepth()` (in-memory stand-in for SQS ApproximateNumberOfMessages(+NotVisible))
- Tests / fixtures: `apps/web/tests/capacity-reject.test.ts` (predictor + admit + `queue_full` + no progress fields). Also green: `jobs-api.test.ts`, `queue-leases.test.ts`.
- Docs: `infra/convert-worker/README.md` (US-041 cap matrix + capacity reject), `infra/README.md` env notes, ECS sketch `_notes`.
- Claim check against [[Claims and Non Goals]]: No invented progress %; no charge on reject; p50 labeled placeholder; no PyMuPDF image publish; no perfect-layout / ATS claims.
- Explicit non-goals this story: real SQS/ECS ready-worker probe (env placeholder); publishing convert image; measured p50 ([[US-092]]).

### Code review (US-041)

**Verdict: PASS** — no Critical findings. Ready for QA verification.

| Blocker check | Result |
|---|---|
| Invented progress % | PASS — reject body is `{ error, retryAfterSeconds }` only; UI stages forbid % |
| Charge / quota on `queue_full` | PASS — `assertCapacityAllowsNewJob` before `insertJob`; reject path issues no secret/id |
| Product RAM raised to Fargate 2 GiB | PASS — `WORKER_MEMORY_MIB=1024`; ECS `2048` documented as platform floor only |
| PyMuPDF public image publish | PASS — isolation image / ECS URI still blocked; no publish performed in review |
| Secrets in capacity responses | PASS — `jsonError` only; capacity logs have depth/wait/retry, no tokens |

**Tests run:** `apps/web` `vitest run tests/capacity-reject.test.ts` — 6/6 passed.

**Critical:** none  
**Warning:** none  
**Suggestion:** optional stronger test assert that `countQuotaJobsSince` is unchanged after `queue_full` (today implied by no insert / no `id`).
