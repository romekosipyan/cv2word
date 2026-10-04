---
type: story
id: US-043
title: Redacted metrics and incident alerts
status: done
priority: P0
epic: "[[E06 Abuse Reliability]]"
requirement: R06
spec: "[[SPEC-EVENTS]]"
assignee_role: devops-sre
plan_week: week-4
estimate: M
depends_on: ['US-053']
tags:
  - story
  - p0
  - devops
aliases:
  - US-043
---

# US-043 Redacted metrics and incident alerts

As operations, I want redacted job metrics and alerts so incidents are visible without leaking resume contents.

## Links

- Epic: [[E06 Abuse Reliability]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[SPEC-EVENTS]]
- Role: `devops-sre` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-4
- Depends on: [[US-053]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Alerts exist for worker crash rate, cleanup backlog, queue wait, and conversion_failed rate.
- [x] Logs and alerts contain only sanitized error codes, buckets, engine version, and opaque ids.
- [x] No filenames, extracted text, tokens, or request bodies.

## Implementation notes

In-process redacted alerts in `apps/web/src/lib/alerts/` (fail-closed sanitize + emit). Hooks: US-053 telemetry sink → conversion_failed rate; worker-sim catch → worker crash; capacity path → queue_wait + capacity_reject; sweeper → cleanup_backlog + rate re-eval. Ops wiring documented in `infra/README.md` — CloudWatch/SNS **not** provisioned.

## Evidence

- Reviewer: **code-reviewer — PASS** (2026-10-03). **security-engineer — PASS** (co-signed; see Security review below). Status left `in-review`; kanban not edited.
- Critical: none. AC met — `worker_crash_rate`, `cleanup_backlog`, `queue_wait`, `conversion_failed_rate` via fail-closed `emitRedactedAlert` / `sanitizeAlertFields`; hooks on telemetry sink, worker-sim catch (opaque id only), capacity, sweeper. No filenames / extracted text / tokens / bodies in payloads. `infra/README.md` correctly states CloudWatch/SNS **not** provisioned.
- Warning (non-blocking): `reason` allows any `^[a-z][a-z0-9_]*$` ≤64; `jobId`/`engineVersion` accept any ≤64 string (call sites are safe; tighten if free-text ever appears).
- Suggestion: in-process sliding windows are single-process; multi-instance aggregation needs CloudWatch when provisioned (already residual in infra notes).
- Tests / fixtures: Re-ran `npm test -- tests/redacted-alerts.test.ts` — **9/9 passed** (code-reviewer + security-engineer). Prior related green noted by implementer: deletion-reconciliation (11), capacity-reject (6), privacy-telemetry (7).
- Claim check against [[Claims and Non Goals]]: No demand/ranking/ATS claims in alert copy; queue wait uses Reliability Targets planning threshold (15s), not a verified SLA. Residual: production CloudWatch alarms / SNS not provisioned — local stubs + documented metric-filter names only.

### Security review (US-043 redacted metrics / alerts)

- Reviewer: security-engineer
- Date: 2026-10-03
- Scope: `apps/web/src/lib/alerts/*` (sanitize, emit, incident, cleanup-backlog, queue-wait), wiring from US-053 telemetry sink (`ensureIncidentAlertsInstalled` / `instrumentation.ts`), `worker-sim` crash catch, capacity path (`assertCapacityAllowsNewJob`), sweeper (`emitCleanupBacklogAlert` + rate re-eval), `infra/README.md` ops residual — vs [[SPEC-EVENTS]] / [[Privacy Contract]] / [[SPEC-SECURITY]]
- Verdict: **PASS**
- Status left `in-review` (kanban not edited; FAIL→in-progress N/A)

| Check | Result |
|---|---|
| Fail-closed sanitization | Pass — allowlisted keys only; forbidden-key fragments dropped; catalog `error` codes only; unknown/non-catalog values dropped; serialized payload leak heuristics → `{ reason: "sanitize_rejected" }` before log/sink |
| No resume text / filenames / tokens / bodies | Pass — emit path never accepts those keys into fields; `worker-sim` catch records opaque `jobId` + `engineVersion` only (no exception message); telemetry hook receives post-sanitize essential events; tests assert no filename/secret/token/`%PDF`/“Resume of” in payloads or warn lines |
| Opaque ids / catalog codes / buckets only | Pass — wired fields are counts/rates/thresholds, opaque job ids, catalog `error`, size/page buckets, engine version; `capacity_reject` fixed to `queue_full` |
| CloudWatch/SNS residual | Pass — `infra/README.md` explicitly documents metric-filter names and that CloudWatch alarms / SNS / dashboards are **not** provisioned; story claim check matches — production monitoring not claimed done |

**Residuals (non-blocking for US-043):**

- Production CloudWatch metric filters, SNS paging, and dashboards remain ops follow-up (documented; not a privacy leak).
- Defense-in-depth (same as code-reviewer Warning): `reason` / `jobId` / `engineVersion` string shape is looser than a strict opaque-id charset; mitigated by call-site discipline, length/newline caps, and `payloadLooksLeaky` on common leak patterns.
- Do not claim legal compliance from this alert path.

No launch blockers introduced by the redacted alert emit path.
