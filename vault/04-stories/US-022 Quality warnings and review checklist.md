---
type: story
id: US-022
title: Quality warnings and review checklist
status: spec-ready
priority: P0
epic: "[[E05 Converter UI]]"
requirement: R04
spec: "[[SPEC-FIDELITY]]"
assignee_role: frontend-developer
plan_week: week-3
estimate: S
depends_on: ['US-020']
tags:
  - story
  - p0
  - frontend
aliases:
  - US-022
---

# US-022 Quality warnings and review checklist

As a user, I want specific warnings and a short review checklist so I do not send a broken resume to an employer.

## Links

- Epic: [[E05 Converter UI]]
- Requirement: R04 in [[MVP Priorities]]
- Spec: [[SPEC-FIDELITY]]
- Role: `frontend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-020]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] Upload and result both disclose that formatting may change.
- [ ] Detectable issues such as font substitution or possible column order are listed when present.
- [ ] Copy never claims perfect layout, ATS compatibility, or 100% accuracy.
- [ ] Empty or omitted-page results are blocked, not warned-and-succeeded.

## Implementation notes

[[Claims and Non Goals]].

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
