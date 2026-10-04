---
type: story
id: US-083
title: Paid enhancement experiment
status: backlog
priority: P1
epic: "[[E10 P1 Experiments]]"
requirement: R11
spec: "[[SPEC-API]]"
assignee_role: product-owner
plan_week: p1
estimate: L
depends_on: ['US-110']
tags:
  - story
  - p1
  - payments
aliases:
  - US-083
---

# US-083 Paid enhancement experiment

As product, I want one optional paid enhancement with price shown before processing so we can test willingness to pay without locking a promised free download.

## Links

- Epic: [[E10 P1 Experiments]]
- Requirement: R11 in [[MVP Priorities]]
- Spec: [[SPEC-API]]
- Role: `product-owner` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / p1
- Depends on: [[US-110]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [ ] Price and entitlement are shown before upload or opt-in.
- [ ] An already promised free download cannot be locked behind payment.
- [ ] Refunds, webhook idempotency, tax, and checkout privacy are defined before charging.
- [ ] A waitlist click is not treated as payment success.

## Implementation notes

€2–€5 per job is a hypothesis, not a price decision. Gated.

## Evidence

- Reviewer:
- Tests / fixtures:
- Claim check against [[Claims and Non Goals]]:
