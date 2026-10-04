---
type: decision
id: ADR-001
status: accepted
human_reviewer: product owner (accepted in product session 2026-10-04)
tags:
  - adr
aliases:
  - ADR-001 Processing Region
---

# ADR-001 Processing Region

## Status

**accepted — P0 processing region `eu-central-1` (Frankfurt).** Product owner accepts the [[US-072]] / [[ADR-002 Hosting Store and Queue]] candidate for P0. Accepted 2026-10-04. This is a product hosting control, not a claim of legal compliance. Launch-country choice, processor contracts, and public notice text remain residuals for [[US-111]] and counsel.

| Field | Value |
|---|---|
| `human_reviewer` | product owner (session 2026-10-04) |
| Cloud | AWS (see [[ADR-002 Hosting Store and Queue]]) |
| Processing region | **`eu-central-1`** / Frankfurt am Main, Germany |
| Launch country | **Unset** — product/counsel residual before public MVP |

## Context

Uploads are personal documents. The privacy notice must name processing region and processors before collection. Architecture and hosting already assume a single AWS region; Frankfurt matches ADR-002 and keeps originals, outputs, queue, metadata, and workers together.

## Options considered

- Single EU region — **accepted** (`eu-central-1`)
- Single US region — rejected for P0 without a documented product reason
- Multi-region — out of P0 (extra copies conflict with [[Deletion Contract]])

## Constraint

Do not collect public uploads until region, processors, and contact route are **published** ([[US-111]], [[Privacy Contract]]). Region acceptance unblocks notice drafting; it does not authorize collection by itself.

## Decision

**Process P0 conversions only in AWS `eu-central-1`.** Name that region on the privacy notice once processor list and contact route are ready. Prefer Frankfurt over Ireland (`eu-west-1`) as the EU-first default unless a later decision records a reason to move.

## Residuals (do not reopen this ADR)

- Launch country / market jurisdiction for public MVP
- Human-approved processor identity list and any SCCs or DPAs
- Final privacy-notice wording ([[US-111]])

## Consequences

- [[US-111]] may draft notices naming `eu-central-1` / Frankfurt.
- Infra and spend planning stay aligned with ADR-002 Option A.
- Changing region later requires a new decision and notice update before cutover.
