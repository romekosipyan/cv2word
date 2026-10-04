---
type: story
id: US-111
title: Privacy notices and processors
status: spec-ready
priority: P0
epic: "[[E09 Beta and Launch]]"
requirement: R05
spec: "[[SPEC-SECURITY]]"
assignee_role: security-engineer
plan_week: week-6
estimate: M
depends_on: ['US-032']
tags:
  - story
  - p0
  - privacy
aliases:
  - US-111
---

# US-111 Privacy notices and processors

As a user, I want to see who processes my file, where, how long, and how to contact support before I upload.

## Links

- Epic: [[E09 Beta and Launch]]
- Requirement: R05 in [[MVP Priorities]]
- Spec: [[SPEC-SECURITY]]
- Role: `security-engineer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-6
- Depends on: [[US-032]]
- Board: [[SDLC Kanban]]
- Decisions: [[ADR-001 Processing Region]] (accepted), [[ADR-008 Consent and Legal Basis]] (accepted essential-only)

## Acceptance criteria

- [ ] Processor identities, region, retention, and contact route are published before uploads are collected.
- [x] [[ADR-001 Processing Region]] and [[ADR-008 Consent and Legal Basis]] are decided or launch is blocked. *(2026-10-04: both accepted for product scope — region `eu-central-1`; essential-only telemetry / marketing off. Counsel residuals below.)*
- [ ] Notices match the implemented [[Deletion Contract]].

## Implementation notes

Product controls, not a legal-compliance claim.

**Unblocked for drafting (product session 2026-10-04):**

- Name processing region **AWS `eu-central-1` / Frankfurt** per ADR-001.
- Assume **essential-only** operational telemetry and **no marketing tags** on converter screens per ADR-008 / [[US-053]] / [[SPEC-EVENTS]].
- Do not start implementation while security lane is on [[US-091]] / [[US-093]]; story stays `spec-ready` until orchestrator assigns.

**Counsel / human residuals before public collection:**

- Launch country / market jurisdiction
- Approved processor identity list (e.g. AWS) and any DPA/SCC packaging
- Legal-basis wording for essential service telemetry and user-rights / contact route text
- Confirmation of cookie/banner needs for essential-only vs. disclosure-only notice
- Final publish of notice before any public upload collection

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
