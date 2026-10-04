---
type: story
id: US-091
title: Isolation and abuse tests
status: done
priority: P0
epic: "[[E08 Release Verification]]"
requirement: R06
spec: "[[SPEC-SECURITY]]"
assignee_role: security-engineer
plan_week: week-4
estimate: M
depends_on: ['US-013', 'US-040']
tags:
  - story
  - p0
  - security
aliases:
  - US-091
---

# US-091 Isolation and abuse tests

As security, I want proof that forged MIME, foreign job ids, and expired credentials never return file bytes.

## Links

- Epic: [[E08 Release Verification]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[SPEC-SECURITY]]
- Role: `security-engineer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-4
- Depends on: [[US-013]], [[US-040]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Cross-job access tests fail closed.
- [x] Worker has no outbound network in the deployed runtime.
- [x] Rate limit and quota tests cannot be bypassed by repeating complete-upload.

## Implementation notes

[[Threat Model]] and [[Acceptance Criteria]] item 2–3.

### Delivered (security-engineer)

- `apps/web/tests/isolation-abuse.test.ts` — automated fail-closed suite (cross-job, expired, forged MIME, query secrets, complete-upload quota/rate bypass, compose/ECS/dry_run no-egress evidence).
- `apps/web/src/lib/jobs/auth.ts` — authorize always pays hash + timingSafeEqual (dummy hash when job missing) to reduce existence oracles.
- Did **not** edit convert pipeline under `workers/convert` engine paths; isolation evidence reads existing compose/ECS/dry_run artifacts from [[US-013]].
- Kanban not edited (orchestrator parallel lane).

## Evidence

- Builder: security-engineer (2026-10-04).
- Reviewer: code-reviewer — **signed 2026-10-04 — PASS**. Status left `in-review` for `qa-engineer`. Kanban not edited.
- Code review (US-091 only):

| Gate | Severity | Result | Notes |
|---|---|---|---|
| Cross-job access serves no file bytes | Critical | PASS | Foreign secret on job B: status `401`, download `404`/`unauthorized`, complete-upload `401`; `assertNoFileBytes` — no DOCX/`secret`/`upload`. Re-ran suite **10/10**. |
| Unknown / expired credentials fail closed | Critical | PASS | Missing job → `401`; expired → `410 expired`; download never returns bytes. `authorizeJob` always pays `hashSecret` + `timingSafeEqual` (dummy hash when missing). |
| Secrets not accepted from query / leaky bodies | Critical | PASS | `?secret=` / `?token=` → `401`; download remaps auth failures to neutral `404` + `{ error: "unauthorized" }` only. |
| Forged MIME rejected server-side | Critical | PASS | `application/pdf` + `not_pdf.bin` → `415 unsupported_type`, not queued, job `failed`. |
| Complete-upload cannot bypass quota / create rate | Critical | PASS | Replay ×3 → `quota_counted=1`, one live queue msg; post-delete create still `429`; create IP limit held after complete-upload spam. |
| Worker no-outbound evidenced for runtime artifacts | Critical | PASS | Compose isolation + convert `network_mode: none`; ECS sketch public IP disabled / NAT absent / no default internet / `sg-…-no-egress`; `dry_run.py` `_assert_no_egress`. Aligns with [[US-013]] executed dry-run (`dry_run_egress=denied`). Live Fargate SG attach remains ADR-002 residual (non-blocking here). |
| Claims / privacy | Critical | PASS | No perfect-layout / ATS / OCR / demand claims; no resume text persistence in this change set. |

- Tests / fixtures: `cd apps/web && npm test -- tests/isolation-abuse.test.ts` → **10/10 passed** (re-verified by code-reviewer).
- Claim check against [[Claims and Non Goals]]: PASS — no perfect-layout / ATS / OCR / demand claims; no legal compliance claim. Outbound deny is documented runtime policy evidence (compose + ECS sketch + dry_run), not a live cloud attach proof.
- Warnings (non-blocking):
  - US-091 egress tests are **static** guards on compose/ECS/`dry_run.py` text; they do not re-execute Docker isolation dry-run in CI. Rely on [[US-013]] runtime evidence until ADR-002 live attach.
  - Idempotent complete-upload still logs `job_enqueued` on in-memory no-op dedupe (misleading ops signal; queue correctly keeps one live message).
- Residuals (non-blocking): live Fargate attach / SG probe still belongs to infra acceptance when ADR-002 spend is accepted; in-process rate limiter remains single-instance (US-040 residual); SQS adapter (when added) must preserve enqueue-by-`jobId` dedupe proven in `InMemoryJobQueue`.

### QA Evidence — PASS (2026-10-04)

- Verifier: qa-engineer. Orchestrator handoff In Review → QA after code-reviewer PASS. Kanban not edited.
- Command: `cd apps/web && npm test -- tests/isolation-abuse.test.ts` → **10/10 passed** (vitest 3.2.7, ~2.1s).

| AC | Result | Evidence |
|---|---|---|
| Cross-job access fail closed | PASS | Foreign secret on job B: status `401`, download `404`/`unauthorized`, complete-upload `401`; unknown job `401`/`404`; expired `410`/`expired`; query `?secret=`/`?token=` rejected; forged MIME → `415 unsupported_type`, not queued. `assertNoFileBytes` — no DOCX / `secret` / `upload`. |
| Worker no outbound network evidenced | PASS | Compose isolation + convert: `network_mode: none`, no published ports; ECS sketch: public IP `DISABLED`, NAT `ABSENT`, `defaultRouteToInternet: false`, SG matches `no-egress`; `dry_run.py` contains `_assert_no_egress` / `dry_run_egress=denied` / fail on open socket. Static artifact guards (same residual as reviewer: not a live Fargate attach). |
| Rate/quota not bypassed via complete-upload | PASS | Replay ×3 → `quotaCounted=1`, one live queue message; post-delete create still `429`; create IP limit held after complete-upload spam ×5. |

- Spec alignment ([[SPEC-SECURITY]]): job ID not a capability; no secrets in query; workers no outbound; quota/rate abuse paths covered.
- Non-blocking: idempotent complete-upload still emits `job_enqueued` on no-op dedupe (queue correctly one live msg); egress evidence remains static until ADR-002 live attach.
