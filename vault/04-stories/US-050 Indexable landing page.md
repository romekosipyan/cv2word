---
type: story
id: US-050
title: Indexable landing page
status: spec-ready
priority: P0
epic: "[[E07 SEO Content]]"
requirement: R07
spec: "[[SPEC-SEO]]"
assignee_role: growth-seo
plan_week: week-6
estimate: M
depends_on: ['US-001', 'US-060']
tags:
  - story
  - p0
  - seo
aliases:
  - US-050
---

# US-050 Indexable landing page

As a search visitor, I want a crawlable landing page with the working converter above the fold so I can start the task immediately.

## Links

- Epic: [[E07 SEO Content]]
- Requirement: R07 in [[MVP Priorities]]
- Spec: [[SPEC-SEO]]
- Role: `growth-seo` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-6
- Depends on: [[US-001]], [[US-060]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] Server-rendered title, one H1, limits, warning, privacy summary, and synthetic before/after are present.
- [ ] Converter code loads progressively. Marketing text remains crawlable without JS.
- [ ] Upload/status/result URLs are noindex and absent from this page's indexable links as job URLs.

## Implementation notes

[[Landing Page]].

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
