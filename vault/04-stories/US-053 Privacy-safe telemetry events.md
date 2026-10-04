---
type: story
id: US-053
title: Privacy-safe telemetry events
status: done
priority: P0
epic: "[[E07 SEO Content]]"
requirement: R06
spec: "[[SPEC-EVENTS]]"
assignee_role: backend-developer
plan_week: week-3
estimate: M
depends_on: []
tags:
  - story
  - p0
  - analytics
aliases:
  - US-053
---

# US-053 Privacy-safe telemetry events

As growth and operations, I want funnel events that never include resume contents so we can measure utility without leaking data.

## Links

- Epic: [[E07 SEO Content]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[SPEC-EVENTS]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: None
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Only the allowed event names and properties in [[SPEC-EVENTS]] are emitted. *(essential-only subset while ADR-008 open; see allowlist in `apps/web/src/lib/events/catalog.ts` and SPEC-EVENTS)*
- [x] No filename, text, token, contact, or raw URL is stored.
- [x] Non-essential marketing tags stay off converter screens until [[ADR-008 Consent and Legal Basis]] is decided. *(residual: `landing_view`, `quality_feedback`, and consented acquisition remain gated; no marketing pixels in layout/converter)*

## Implementation notes

Essential-only subset shipped before the ADR is closed. Capacity/quota/rate rejects map to `validation_failed` with `queue_full` / `rate_limited`. US-043 metrics hook stub only (`registerTelemetryMetricsHook`); full incident platform deferred.

## Evidence

- Reviewer: **PASS** (code-reviewer) — essential-only subset matches SPEC-EVENTS + ADR-008 open gate; call sites emit allowlisted props only; no marketing pixels on layout/converter; sanitize drops filename/secret/token/text/URL/acquisition. **security-engineer — PASS** (co-signed; see Security review below). Status left `in-review`; kanban not edited.
- Tests / fixtures: `apps/web/tests/privacy-telemetry.test.ts` — **7/7 passed** (re-run by code-reviewer and security-engineer: `npm test -- tests/privacy-telemetry.test.ts`). Related suites capacity/quota/deletion still green (24/24).
- Claim check against [[Claims and Non Goals]]: No demand/ranking numbers or ATS claims in events; download_requested is a request signal only, not editing proof.

### Security review (US-053 essential-only telemetry)

- Reviewer: security-engineer
- Date: 2026-10-03
- Scope: `apps/web/src/lib/events/*` (catalog, sanitize, emit, client, sink), Converter `file_selected` (`Converter.tsx` → `emitFileSelected`), lifecycle emit call sites (`service.ts`, `lease.ts`, `worker-sim.ts`, `sweeper.ts`, capacity/ratelimit), root `layout.tsx` vs [[SPEC-EVENTS]] / [[ADR-008 Consent and Legal Basis]] / [[Privacy Contract]]
- Verdict: **PASS**
- Status left `in-review` (kanban not edited)

| Check | Result |
|---|---|
| Sanitize drops forbidden props | Pass — allowlist + forbidden-key fragments drop filename/secret/token/text/url/contact/acquisition/utm; non-catalog error codes and strings >64 chars dropped; tests assert cleaned props and log lines |
| No secrets / filenames / resume text | Pass — call sites emit opaque `jobId`, buckets, catalog `error`, enum `reason` (`expiry_sweep` \| `user_delete`); Converter uses size bucket only (`emitFileSelected` reads `size` only); sink/hooks receive post-sanitize payloads; suite asserts no secret / `%PDF` / “Resume of” |
| ADR-008 gate (no marketing on converter) | Pass — `MARKETING_TELEMETRY_ENABLED=false`; `landing_view` / `quality_feedback` → `marketing_gated`; essential allowlist matches SPEC-EVENTS subset; root layout has no marketing/analytics pixels or third-party tags |
| Residual consent work documented | Pass — ADR-008 remains **open** (public launch blocker); AC + catalog note gated `landing_view`, `quality_feedback`, consented acquisition; processor/notice/legal basis remain [[US-111]] / ADR-008 — not claimed closed by this story |

**Residuals (non-blocking for US-053; launch blockers elsewhere):**

- Documented legal basis for essential service telemetry + marketing consent decision: [[ADR-008 Consent and Legal Basis]] (still open).
- Processor identities, region, retention, contact route before public collection: [[US-111]].
- Do not claim legal compliance from this engineering subset.

No launch blockers introduced by the essential-only emit path. Do not claim legal compliance.
