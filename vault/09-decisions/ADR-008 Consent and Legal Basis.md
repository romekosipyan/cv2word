---
type: decision
id: ADR-008
status: accepted
human_reviewer: product owner (accepted in product session 2026-10-04)
tags:
  - adr
  - privacy
aliases:
  - ADR-008 Consent and Legal Basis
---

# ADR-008 Consent and legal basis

## Status

**accepted — essential-only telemetry for P0 converter; marketing tags off.** Product owner accepts the shipped [[US-053]] essential-only posture as the P0 product decision. Accepted 2026-10-04. This note is a product scope decision, not legal advice and not a claim that counsel has validated the legal basis.

| Field | Value |
|---|---|
| `human_reviewer` | product owner (session 2026-10-04) |
| Converter / product telemetry | **Essential-only** allowlist per [[SPEC-EVENTS]] |
| Marketing / acquisition tags on converter | **Off** for P0 |
| Non-essential events | Stay gated (`landing_view`, `quality_feedback`, consented acquisition) until a later product+counsel decision |

## Context

Marketing measurement needs an applicable consent decision. Essential service telemetry needs a documented basis. [[US-053]] already ships an essential-only subset with marketing pixels off converter screens while this ADR was open.

## Decision

1. **P0 converter and job lifecycle emit only essential service events** defined in [[SPEC-EVENTS]] (and the US-053 catalog). No resume text, filenames, tokens, bodies, or document snapshots.
2. **Do not enable non-essential marketing pixels or third-party acquisition tags on converter screens in P0.**
3. **Product treats “operate the free anonymous converter and prevent abuse” as the intended product purpose** for essential telemetry. Formal legal-basis wording and user-rights language are residuals for counsel via [[US-111]] — they do not block this product acceptance of essential-only scope.

## Residuals for counsel / [[US-111]] (launch, not this ADR reopen)

- Documented legal-basis language for essential service telemetry in the privacy notice
- Processor identities, retention, contact route, and user-rights review before public collection
- Any future enablement of marketing or consented acquisition attributes (out of P0 unless a new decision says otherwise)
- Confirmation that essential-only events need no cookie banner vs. what must be disclosed — counsel owns; product ships essential-only until told otherwise

## Consequences

- [[US-053]] essential-only path remains the P0 implementation contract.
- [[US-111]] can draft notices assuming marketing tags off and essential operational metrics on.
- Enabling marketing measurement later requires a new ADR revision or follow-on decision plus UI consent work.
