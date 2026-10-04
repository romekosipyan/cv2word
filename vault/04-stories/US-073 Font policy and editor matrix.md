---
type: story
id: US-073
title: Font policy and editor matrix
status: done
priority: P0
epic: "[[E01 Feasibility]]"
requirement: R04
spec: "[[SPEC-FIDELITY]]"
assignee_role: qa-engineer
plan_week: week-1
estimate: S
depends_on: ['US-070']
tags:
  - story
  - p0
  - spike
aliases:
  - US-073
---

# US-073 Font policy and editor matrix

As QA, I want approved font substitutions and exact editor versions so conversion warnings and compatibility tests are concrete.

## Links

- Epic: [[E01 Feasibility]]
- Requirement: R04 in [[MVP Priorities]]
- Spec: [[SPEC-FIDELITY]]
- Role: `qa-engineer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-1
- Depends on: [[US-070]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] [[ADR-005 Font Policy]] lists allowed substitutions and when to warn.
- [x] [[Editor Matrix]] and [[ADR-006 Editor Versions]] name desktop Word and LibreOffice versions.
- [x] Restricted fonts are never embedded.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

Policy status remains **proposed** until product confirms ADRs. Do not mark ADRs `accepted` from this story alone. Editor builds are **proposed until verified** in [[US-094]]. Do not start US-094 from this card.

## Evidence

- Reviewer: tech-lead (signed 2026-10-03). Author: qa-engineer (2026-10-03).
- Tests / fixtures:
  - Policy derived from [[SPEC-WORKER]], [[SPEC-FIDELITY]], [[Claims and Non Goals]], and [[US-070]] `workers/convert/spike/RESULTS.md` (soft-hyphen / spacing note; no editor open-edit in that spike).
  - [[ADR-005 Font Policy]] — approved base fonts, substitution table, warn codes (`font_substituted`, `font_metrics_risk`, `glyph_missing`, `hyphen_encoding`), never-embed restricted fonts.
  - [[ADR-006 Editor Versions]] + [[Editor Matrix]] — Word Microsoft 365 Current Channel 2609 (Build 20430.20092) and LibreOffice Writer 26.2.6 on Windows 11 24H2 x64 en-US; labeled proposed pending [[US-094]].
- Claim check against [[Claims and Non Goals]]:
  - No pixel-identical or ATS claims.
  - Warnings are indicators, not confidence scores.
  - Required disclosure path remains “Formatting may change…” plus specific font-substitution warnings ([[US-022]]).
- Residual risk (handoff):
  - [[US-011]] must enforce package never-embed and attach warn codes when substituting.
  - [[US-094]] must verify open/edit/save on the pinned builds; re-pin if Current Channel advances.
  - Product confirmation still required before ADR status → accepted.
- Tech-lead review (2026-10-03) — status remains `in-review` for orchestrator/product gate; ADRs left `proposed`:
  - **Critical: PASS** — AC met: substitutions + warn rules in ADR-005; named Word/LibreOffice builds in ADR-006 + Editor Matrix; never-embed restricted (and all) fonts stated as hard rule aligned with SPEC-WORKER.
  - **Warning: PASS** — ADR-005/ADR-006 stay `proposed` (not accepted); builds labeled proposed until US-094; claim-safe (no pixel/ATS guarantees; warnings are indicators); residuals correctly deferred to US-011 (enforce) and US-094 (verify), not started here.
  - **Suggestion: PASS** — Optional clarity only: ADR-005 marks Helvetica→Arial `font_metrics_risk` as “optional”; US-011 can treat that as always-on with `font_substituted` or drop the optional wording. Non-blocking.
  - **Verdict: PASS.** Story may move to Done with ADRs still `proposed`; product confirm + US-094 verification are separate gates before ADR `accepted`.
