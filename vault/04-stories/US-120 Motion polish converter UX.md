---
type: story
id: US-120
title: Motion polish converter UX
status: ready
priority: P0
epic: "[[E05 Converter UI]]"
requirement: R03
spec: "[[SPEC-UI]]"
assignee_role: frontend-developer
plan_week: week-6
estimate: S
depends_on: ['US-001', 'US-004', 'US-020', 'US-021', 'US-060', 'US-115']
tags:
  - story
  - p0
  - frontend
  - ux
  - motion
aliases:
  - US-120
---

# US-120 Motion polish converter UX

As a job seeker, I want clear, purposeful motion through convert stages so I can follow progress without fake percentages or gimmicks.

## Links

- Epic: [[E05 Converter UI]]
- Requirement: R03 in [[MVP Priorities]]
- Direction: [[Motion Design Direction]]
- Spec: [[SPEC-UI]], [[SPEC-A11Y]]
- Contract: [[UX Contract]]
- Role: `frontend-developer` (UX review against direction note) — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-6 polish
- Depends on: [[US-001]], [[US-004]], [[US-020]], [[US-021]], [[US-060]], [[US-115]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] Given the converter UI, when CSS motion tokens from [[Motion Design Direction]] are present, then hover/press, file-selected, stage, result/failure, download, delete, and convert-another interactions use those durations/easings consistently.
- [ ] Given a running conversion, when stages change, then only named stages animate (Uploading / Waiting / Converting / Checking output) with no percentage or determinate fake progress.
- [ ] Given `prefers-reduced-motion: reduce`, when the user completes upload → convert → download → delete, then state remains understandable without motion; live regions and focus moves still work.
- [ ] Given the landing page, when motion polish ships, then the tool remains above the fold, Convert is not animation-gated, dual fidelity warnings remain visible, and no new fidelity/ATS/perfect-layout claims appear.
- [ ] Given delete, when cleanup is not yet verified, then UI shows in-progress (optionally softened by motion) and only then confirmed deleted.

## Implementation notes

- Follow [[Motion Design Direction]] handoff. Prefer CSS tokens in `apps/web`; avoid heavy animation libraries unless already justified.
- Client convert path ([[US-115]] / [[US-119]]) is the active P0 surface; do not reintroduce server-job theater.
- Preserve [[Claims and Non Goals]] and progressive loading in [[SPEC-UI]].
- UX designer reviews craft + anti-patterns before Done; `code-reviewer` / a11y spot-check per [[US-060]] patterns.

## Verification

- Reviewer: `ux-designer` then `code-reviewer`; optional `qa-engineer` reduced-motion pass
- Evidence: screenshots or short clips optional; required — keyboard path notes, reduced-motion check, confirmation that no `%` appears in processing UI

## Kanban

Card lives in **Ready** on [[SDLC Kanban]] until a frontend agent claims it → In Progress.
