---
type: story
id: US-052
title: Canonical URLs and sitemap
status: backlog
priority: P0
epic: "[[E07 SEO Content]]"
requirement: R07
spec: "[[SPEC-SEO]]"
assignee_role: growth-seo
plan_week: week-6
estimate: S
depends_on: ['US-050', 'US-051']
tags:
  - story
  - p0
  - seo
aliases:
  - US-052
---

# US-052 Canonical URLs and sitemap

As growth, I want canonical URLs and an XML sitemap of public pages so job URLs are not indexed.

## Links

- Epic: [[E07 SEO Content]]
- Requirement: R07 in [[MVP Priorities]]
- Spec: [[SPEC-SEO]]
- Role: `growth-seo` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-6
- Depends on: [[US-050]], [[US-051]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] Public pages have canonicals and appear in the sitemap.
- [ ] Upload, status, result, and file routes are excluded and send X-Robots-Tag noindex, nofollow, noarchive.
- [ ] Error and thin parameter pages are not indexable.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
