---
type: story
id: US-071
title: PyMuPDF license route
status: done
priority: P0
epic: "[[E01 Feasibility]]"
requirement: R02
spec: "[[SPEC-WORKER]]"
assignee_role: tech-lead
plan_week: week-1
estimate: S
depends_on: ['US-070']
tags:
  - story
  - p0
  - spike
  - license
aliases:
  - US-071
---

# US-071 PyMuPDF license route

As the tech lead, I want a recorded license route for PyMuPDF so we do not ship an unlawful worker image.

## Links

- Epic: [[E01 Feasibility]]
- Requirement: R02 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `tech-lead` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-1
- Depends on: [[US-070]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] [[ADR-003 PyMuPDF License]] has options, recommendation, and a named human reviewer.
- [x] No public worker image is published until the ADR is decided.
- [x] Evidence links to https://pymupdf.io/licensing are cited on the ADR.

## Implementation notes

Launch blocker. Qualified review required. Tech-lead recorded options + recommendation only; status must not become `accepted` without a real human. Kanban columns not edited by this role.

## Evidence

- Reviewer: security-engineer — signed 2026-10-03. **Verdict: PASS.** Tech-lead recommendation recorded 2026-10-03.
- ADR: [[ADR-003 PyMuPDF License]] — Option A AGPL (SaaS source-disclosure / modification / producer-notice obligations summarized), Option B commercial (recommended for proprietary SaaS), Option C engine replace (last resort). Pin from [[US-070]]: PyMuPDF `1.28.2`.
- Constraint stated on ADR: **no public worker image** until ADR is `accepted` with a chosen route. No image was published in this story (no Dockerfile / registry publish in repo). [[US-010]] remains blocked (`spec-ready`; ADR + [[SPEC-WORKER]] gate).
- Tests / fixtures: N/A (license route). Spike evidence reused: `workers/convert/spike/RESULTS.md`.
- Claim check against [[Claims and Non Goals]]: no license or compliance claim asserted as final law; no worker ship; AGPL vs commercial left for named human. Vendor page cited: https://pymupdf.io/licensing
- Deployment: remains blocked until human decision. ADR stays `recommended` (not `accepted`); `human_reviewer` remains TBD — product must name qualified counsel/owner. Security does **not** accept the license.

### Security review (2026-10-03) — PASS

| Severity | Finding |
|---|---|
| Critical | None. ADR not `accepted`; no invented `human_reviewer`; no public worker image; no false legal-compliance claim. |
| Warning | AC bullet says “named human reviewer” while `human_reviewer` is TBD. Acceptable for this spike (field present + TBD gate); product must replace TBD before ADR acceptance. Launch blocker (unresolved PyMuPDF license) remains open until human acceptance. |
| Suggestion | Align stale Evidence wording that said story stays `in-progress` with frontmatter `in-review`. Optionally add [[US-071]] / ADR-003 to [[US-010]] `depends_on` so the graph matches the deployment gate. |

**Engineering story vs ADR gate:** US-071 may move to Done as an engineering deliverable (options + recommendation + blocker recorded). ADR-003 acceptance and license route remain human-gated. US-010 / public worker image stay explicitly blocked.
