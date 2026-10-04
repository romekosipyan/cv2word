---
type: story
id: US-040
title: Quota and rate limits
status: done
priority: P0
epic: "[[E06 Abuse Reliability]]"
requirement: R06
spec: "[[SPEC-SECURITY]]"
assignee_role: backend-developer
plan_week: week-3
estimate: M
depends_on: ['US-003']
tags:
  - story
  - p0
  - backend
aliases:
  - US-040
---

# US-040 Quota and rate limits

As the service, I want session quota and rate limits so anonymous use cannot exhaust workers.

## Links

- Epic: [[E06 Abuse Reliability]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[SPEC-SECURITY]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-003]]
- Board: [[SDLC Kanban]]
- ADR: [[ADR-007 Free Quota]] (open — engineering defaults only)

## Acceptance criteria

- [x] Configurable free quota defaults to 3 jobs / 24 hours / session pending [[ADR-007 Free Quota]].
- [x] Create, poll, and download are rate limited.
- [x] Quota counts once per logical job including retries.
- [x] Limit responses include retry timing and never charge the user.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

### Delivered (backend)

- `apps/web/src/lib/ratelimit/` — in-memory sliding-window limiter keyed by hashed client address (+ job id for poll/download). Env: `RATE_LIMIT_*`.
- Free quota: `FREE_QUOTA_PER_24H` (default 3) + `FREE_QUOTA_WINDOW_SECONDS` (default 86400). Counted once at create via `quota_counted`; idempotent replay / complete-upload / worker retry do not re-charge. Pending ADR-007 — no paid billing.
- Create path: client rate limit → one-active-job → session quota → capacity (US-041) → insert.
- Poll (`GET /api/jobs/{id}`) and download (`GET .../download`) enforce rate limits; download does not remap `rate_limited` to unauthorized.
- All limit rejects: `429` + `error: rate_limited` + `Retry-After` / `retryAfterSeconds`; no job id/secret issued on create reject.
- Reject logs: opaque bucket + retry seconds only (no IP, filename, secret, resume text).

### Reviewer needed

Orchestrator: assign `code-reviewer` (then `security-engineer` / `qa-engineer` as listed for abuse stories). Kanban not edited by implementer.

## Evidence

- Builder: `cd apps/web && npm test` → **51/51 passed** (2026-10-03), including `tests/quota-ratelimit.test.ts` (7).
- Reviewer: **code-reviewer — PASS** (2026-10-03). Status remains `in-review` for security co-review; kanban not edited.
- Block checks: quota not charged on reject (IP limit → active-job → quota → capacity → insert); `quota_counted` set once at create; idempotent replay / complete-upload / worker paths do not re-charge; 429 bodies include `retryAfterSeconds` + `Retry-After`; download preserves `rate_limited` (not remapped to 404); reject logs omit IP/secrets/filenames/resume text.
- Tests re-run by reviewer: `npm test -- tests/quota-ratelimit.test.ts` → **7/7 passed**.
- Claim check against [[Claims and Non Goals]]: PASS — no paid/checkout; ADR-007 still open with configurable 3/24h engineering default; UI says “not charged” without hard public 3/24h claim.
- Residual (non-blocking): in-process limiter is single-instance until a shared store; public UI copy for exact 3/24h still pending ADR-007 close. Security engineer may co-review separately.

### Security review (US-040 quota / rate-limit paths)

**Verdict: PASS** — no launch-blocking issues on reviewed paths. Status left `in-review`.

| Check | Result |
|---|---|
| Client identity hashing | PASS — `clientKeyFromRequest` SHA-256 truncates opaque key; reject logs emit `bucket` + `retryAfterSeconds` only (no raw IP, secret, filename, or resume text). |
| Secrets in 429 bodies | PASS — `jsonError` returns `{ error, retryAfterSeconds }` only; create rejects never issue `id`/`secret`; download keeps `rate_limited` as 429 (not remapped to auth oracles). |
| Quota not charged on reject | PASS — create order is rate limit → active-job → session quota → capacity → insert with `quota_counted=1`; all 429 paths throw before insert; idempotent replay / complete-upload do not re-charge. |
| Poll/download vs cross-job enumeration | PASS — limits keyed by hashed client + job id; auth still required after; authorize path remains fail-closed (missing/wrong secret → unauthorized). Rate-limit responses do not disclose job existence or secrets beyond existing auth behavior. |

**Residuals (non-blocking for this story):**

- In-process sliding-window limiter is single-instance; multi-instance needs a shared store before horizontal scale.
- `X-Forwarded-For` / `X-Real-IP` must be set only by a trusted edge in production (client-spoofable otherwise).
- Broader isolation / abuse proof (foreign job + secret, complete-upload quota bypass, forged MIME) tracked under [[US-091]].
