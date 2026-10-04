---
type: story
id: US-003
title: Job API and high-entropy secrets
status: done
priority: P0
epic: "[[E02 Job Platform]]"
requirement: R01
spec: "[[SPEC-API]]"
assignee_role: backend-developer
plan_week: week-2
estimate: L
depends_on: ['US-072']
tags:
  - story
  - p0
  - backend
aliases:
  - US-003
---

# US-003 Job API and high-entropy secrets

As an anonymous job seeker, I want a private job created for my upload so only I can check status or download the result.

## Links

- Epic: [[E02 Job Platform]]
- Requirement: R01 in [[MVP Priorities]]
- Spec: [[SPEC-API]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-072]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] POST /api/jobs with an idempotency key creates a job and upload authorization.
- [x] Every subsequent route requires job id plus independent high-entropy secret.
- [x] Job id alone returns unauthorized and no file bytes.
- [x] Secrets never appear in query strings, logs, or analytics.
- [x] One active job per anonymous session is enforced.

## Implementation notes

States follow [[Job State Machine]]. Do not store extracted text.

Implemented under `apps/web` (Next.js App Router). Opaque metadata in SQLite (`node:sqlite`); only a hash of the job bearer secret is stored. Local filesystem object adapter stands in for S3-shaped upload auth (ADR-002). Upload tokens use `Authorization: Upload …` — not the job bearer secret, and not query strings (US-072 warning). `complete-upload` stub-enqueues to `queued` only; no conversion in request handlers. SQS leases = [[US-012]]. Deep PDF validation = [[US-002]]. Verified deletion sweeper = [[US-030]] / [[US-031]].

## Evidence

- Reviewer: **code-reviewer — PASS** (2026-10-03). `status` remains `in-review` (board columns not edited by reviewer). **security-engineer — PASS** (co-signed; see Security review below).
- Tests re-run: `cd apps/web && npm test` → 8/8 passed (2026-10-03). AC coverage matches story list.
- Claim check against [[Claims and Non Goals]]: stub `page.tsx` has required “Formatting may change…” disclaimer; no forbidden layout/ATS/OCR/demand claims in Job API surface.
- Deferred (explicit, not blockers for US-003): silent OCR / empty-success / image-only DOCX (US-010); deep PDF validation before queue (US-002); real SQS enqueue/leases (US-012); verified deletion → `deleted` (US-030/031); production S3/RDS (ADR-002).
- **US-002 unlock:** yes, after this story reaches Done (US-002 `depends_on: US-003`). Do not start US-002/012 from this review.

### Critical

- None. No conversion in request handlers; no resume text/filename in DB or logs; secrets rejected from query strings; job id alone → unauthorized / no bytes; DELETE → `202` + `delete_pending` (not verified `deleted`); only secret hash stored.

### Warning

- Upload auth for `/api/dev/upload` is in-process memory only; `upload_token_hash` is written to SQLite but never checked on PUT. Acceptable as local ADR-002 stand-in; must not ship multi-instance without S3/presign or durable token verify.
- `assertMutatingOrigin` Host-match fallback (no Origin/Referer/Bearer) is weaker CSRF than SPEC-API prefers for cookie mutations — tighten before public launch.
- `complete-upload` only checks object existence then stub-queues; SPEC-API rejection gates (type/size/pages/encrypted/image-only) are correctly deferred to US-002 — do not treat queue path as production-complete.
- No automated tests for upload PUT or `complete-upload` idempotency/auth in this suite.
- Default `JOB_SECRET_PEPPER` (`dev-only-change-me`) if unset — require env in non-dev.

### Suggestion

- Missing/invalid `Idempotency-Key` returns `unauthorized` at 400; prefer a distinct client error (or documented mapping) so clients do not confuse with auth failures.
- Idempotent create rotates a new upload token/hash; document that clients must use the latest upload instructions.
- Unknown route errors map to `conversion_failed` via `handleRouteError` — consider a neutral internal code for non-conversion routes.

### Security review

- Reviewer: **security-engineer — PASS** (2026-10-03). Authz/privacy gate for Job API only. Story `status` left `in-review`; kanban not edited.

#### Critical

- None. Job id is not a capability: subsequent routes require independent bearer (header or path-scoped HttpOnly cookie); job-id-alone and bad secret → `unauthorized`, download remaps to neutral `404` / no DOCX bytes. Secrets rejected from query strings. DB stores `sha256(pepper:secret)` (+ upload token hash), never raw secrets or resume text. Mutations use origin checks; job cookie is HttpOnly + `SameSite=Strict` + path-scoped; responses use `Cache-Control: no-store`. Create/status logs do not emit the secret; redaction covers secret/token/cookie/body/filename keys. One active job / session + 3/24h quota enforced at create.

#### Warning

- `assertMutatingOrigin` Host-match fallback when Origin/Referer absent (Bearer skips check) — SameSite mitigates browser CSRF; tighten cookie-auth mutations before public MVP (aligns with code-reviewer).
- Abuse is session-scoped only; no IP/global rate limits on create/poll/download — cookie rotation bypasses quota. Defer to [[US-040]].
- `JOB_SECRET_PEPPER` / `COOKIE_SECURE` unsafe defaults for local — production must set strong pepper and Secure cookies (fail closed if unset).
- Local upload ticket is memory-only (hash in DB unused on PUT) — OK as ADR-002 stand-in; not multi-instance-safe (see code-reviewer).

#### Suggestion

- Constant-cost authorize path when job row missing (timing oracle); add foreign-job + plausible secret case under [[US-091]].
- Recurse log redaction for nested objects; keep payloads out of logs.
- Prefer a non-`unauthorized` client code for bad idempotency keys.

#### Residual risks (deferred)

- Verified deletion → `deleted`: [[US-030]] / [[US-031]]
- PDF rejection gates before queue: [[US-002]]
- Queue/leases + worker isolation: [[US-012]] / [[US-010]]
- Isolation/abuse tests: [[US-091]]
- IP/rate limits: [[US-040]]
- TLS / at-rest / private buckets / secrets manager: infra + ADR-002
- Processor/region notice + legal: Privacy Contract / ADR-008 / [[US-111]]
