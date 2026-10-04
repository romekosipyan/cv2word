---
type: story
id: US-081
title: Simple reconstruction fallback
status: backlog
priority: P1
epic: "[[E10 P1 Experiments]]"
requirement: R09
spec: "[[SPEC-WORKER]]"
assignee_role: backend-developer
plan_week: p1
estimate: M
depends_on: ['US-110']
tags:
  - story
  - p1
aliases:
  - US-081
---

# US-081 Simple reconstruction fallback

As a user whose layout cannot be reconstructed, I want a clearly disclosed simple editable fallback rather than a silent partial file.

## Links

- Epic: [[E10 P1 Experiments]]
- Requirement: R09 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / p1
- Depends on: [[US-110]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] Fallback is explicit in the UI and discloses layout loss.
- [ ] It cannot be a silent path from the P0 engine.
- [ ] Empty output is still blocked.

## Implementation notes

Gated.

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
