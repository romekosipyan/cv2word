---
type: story
id: US-080
title: Opt-in OCR for scanned PDFs
status: backlog
priority: P1
epic: "[[E10 P1 Experiments]]"
requirement: R08
spec: "[[SPEC-WORKER]]"
assignee_role: backend-developer
plan_week: p1
estimate: L
depends_on: ['US-110']
tags:
  - story
  - p1
  - ocr
aliases:
  - US-080
---

# US-080 Opt-in OCR for scanned PDFs

As a user with a scanned resume, I want an explicit OCR opt-in with its own limits so I am not silently switched from text conversion.

## Links

- Epic: [[E10 P1 Experiments]]
- Requirement: R08 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / p1
- Depends on: [[US-110]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] OCR is never used unless the user opts in after seeing limitations and any price.
- [ ] Separate queue, 180s cap, English language initially, 1–3 pages.
- [ ] New benchmark and accuracy/latency/cost/refusal gates exist. Text-PDF claims are not inherited.

## Implementation notes

Gated. Requires quality/cost case.

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
