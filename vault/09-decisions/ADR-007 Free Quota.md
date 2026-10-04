---
type: decision
id: ADR-007
status: accepted
human_reviewer: product owner (accepted in product session 2026-10-04)
tags:
  - adr
aliases:
  - ADR-007 Free Quota
---

# ADR-007 Free quota

## Status

**accepted — 3 jobs / 24h / anonymous session for P0.** Product owner confirmed the PRD default as the public free-tier limit. Accepted 2026-10-04. This note sets product copy and engineering defaults; it is not a billing or legal commitment beyond the free anonymous P0 scope.

| Field | Value |
|---|---|
| `human_reviewer` | product owner (session 2026-10-04) |
| P0 free quota | **3 jobs per 24 hours per anonymous session** |
| Engineering default | Keep configurable (`FREE_QUOTA_PER_24H` / window) with the same defaults |

## Context

PRD proposed 3 jobs per 24 hours per anonymous session. Engineering already implements that configurable default ([[US-040]]). Product confirms UI and support copy may treat it as the hard public free limit for P0.

## Decision

**P0 public free quota is 3 conversions per rolling 24 hours per anonymous session.** No account, email, or paid checkout in P0. Paid or higher limits remain gated behind [[US-083]] and a separate product decision.

## Consequences

- Landing, converter, and support copy may state the 3/24h session limit.
- Update [[Supported Files and Limits]] from “proposed” to the confirmed P0 contract.
- Abuse and capacity controls ([[US-040]], [[US-041]]) stay in force alongside this quota.
