---
type: plan
tags:
  - plan
aliases:
  - Implementation Plan
---

# Implementation plan

Illustrative six-week sequence from the PRD. Elapsed weeks are not a launch commitment. Replan after the Week 1 spike. Orchestrator pulls cards in this dependency order.

## Week 1 — Feasibility

Exit: Engineering/QA record benchmark spike, font and column results, license route, cost estimate, and hosting recommendation.

| Order | Story | Role | Depends on |
|---|---|---|---|
| 1 | [[US-070]] Conversion fidelity spike | [[Tech Lead]], [[QA Engineer]] | corpus access |
| 2 | [[US-071]] PyMuPDF license route | [[Tech Lead]], [[Security Engineer]] | [[US-070]] evidence |
| 3 | [[US-072]] Hosting, queue, storage, cost | [[DevOps SRE]], [[Tech Lead]] | none |
| 4 | [[US-073]] Font policy and editor matrix | [[Tech Lead]], [[QA Engineer]] | [[US-070]] |

Stop or narrow supported layouts if simple files fail [[SPEC-FIDELITY]] gates.

## Weeks 2–3 — Core MVP

Exit: Upload, queue, worker, result, failures, accessibility, and deletion lifecycle implemented.

Build backend spine first, then UI against real job states.

| Order | Story | Role | Depends on |
|---|---|---|---|
| 5 | [[US-003]] Job API and secrets | [[Backend Developer]] | [[US-072]] recommendation |
| 6 | [[US-002]] Server file validation | [[Backend Developer]] | [[US-003]] |
| 7 | [[US-012]] Queue, leases, retries | [[Backend Developer]], [[DevOps SRE]] | [[US-003]], [[US-072]] |
| 8 | [[US-013]] Worker isolation | [[DevOps SRE]] | [[US-072]], [[US-071]] |
| 9 | [[US-010]] Inspect and convert | [[Backend Developer]] | [[US-012]], [[US-013]], [[US-070]] |
| 10 | [[US-011]] Output validation | [[Backend Developer]] | [[US-010]] |
| 11 | [[US-030]] Expiry sweeper | [[Backend Developer]] | [[US-003]] |
| 12 | [[US-031]] Delete and cancel | [[Backend Developer]] | [[US-030]], [[US-012]] |
| 13 | [[US-032]] Deletion verification | [[Security Engineer]], [[Backend Developer]] | [[US-031]] |
| 14 | [[US-040]] Quota and rate limits | [[Backend Developer]] | [[US-003]] |
| 15 | [[US-041]] Resource caps and reject-full | [[DevOps SRE]] | [[US-012]], [[US-013]] |
| 16 | [[US-001]] Landing upload UI | [[Frontend Developer]] | [[US-002]] contract |
| 17 | [[US-004]] Stages, session, cancel | [[Frontend Developer]] | [[US-003]], [[US-001]] |
| 18 | [[US-020]] Result and download | [[Frontend Developer]] | [[US-011]], [[US-004]] |
| 19 | [[US-021]] Failure and expiry UI | [[Frontend Developer]] | [[US-004]], [[Failure Catalog]] |
| 20 | [[US-022]] Warnings and checklist | [[Frontend Developer]], [[UX Designer]] | [[US-020]] |
| 21 | [[US-060]] WCAG core flow | [[Frontend Developer]], [[UX Designer]] | [[US-020]], [[US-021]] |
| 22 | [[US-053]] Privacy-safe events | [[Backend Developer]], [[Growth SEO]] | [[ADR-008 Consent and Legal Basis]] or essential-only subset |

## Week 4 — Release verification

Exit: Fidelity, isolation, abuse, load, deletion, and editor compatibility pass.

| Order | Story | Role | Depends on |
|---|---|---|---|
| 23 | [[US-090]] Fidelity gates | [[QA Engineer]] | [[US-011]], [[US-070]] |
| 24 | [[US-091]] Isolation and abuse tests | [[Security Engineer]] | [[US-013]], [[US-040]] |
| 25 | [[US-092]] Load and latency | [[QA Engineer]], [[DevOps SRE]] | [[US-010]], [[US-041]] |
| 26 | [[US-093]] Deletion fixtures | [[Security Engineer]], [[QA Engineer]] | [[US-032]] |
| 27 | [[US-094]] Editor compatibility | [[QA Engineer]] | [[US-073]], [[US-011]] |
| 28 | [[US-043]] Redacted metrics and alerts | [[DevOps SRE]] | [[US-053]] |

## Week 5 — Private beta

Exit: 20 target users observed; failures classified; support boundaries or copy revised.

| Order | Story | Role | Depends on |
|---|---|---|---|
| 29 | [[US-100]] Beta instrumentation and support | [[Product Owner]], [[Growth SEO]] | Week 4 gates |
| 30 | [[US-101]] Boundary and copy revision | [[Product Owner]], [[UX Designer]] | [[US-100]] |

## Week 6 — Public MVP

Exit: Approved claims, support coverage, telemetry, privacy review, landing content, rollback plan.

| Order | Story | Role | Depends on |
|---|---|---|---|
| 31 | [[US-050]] Indexable landing page | [[Growth SEO]], [[Frontend Developer]] | [[US-001]], [[US-060]] |
| 32 | [[US-051]] Original support content | [[Growth SEO]] | [[US-050]] |
| 33 | [[US-052]] Canonical URLs and sitemap | [[Growth SEO]] | [[US-050]], [[US-051]] |
| 34 | [[US-111]] Privacy notices and processors | [[Security Engineer]], [[Product Owner]] | [[ADR-001 Processing Region]], [[ADR-008 Consent and Legal Basis]] |
| 35 | [[US-112]] Rollback and ops runbook | [[Release Manager]], [[DevOps SRE]] | [[US-043]] |
| 36 | [[US-110]] Launch signoff | [[Release Manager]], [[Product Owner]] | all P0 stories, [[Launch Review Checklist]] |

## P1 — gated, do not start from kickoff

Start only with a validated quality/cost case and documented feature AC.

| Story | Requirement |
|---|---|
| [[US-080]] Opt-in OCR | R08 |
| [[US-081]] Reconstruction fallback | R09 |
| [[US-082]] Original vs rendered comparison | R10 |
| [[US-083]] Paid enhancement experiment | R11 |

## Kickoff sequence for agents

1. Orchestrator opens [[SDLC Kanban]] and pulls [[US-070]] plus [[US-072]] in parallel.
2. Tech lead and QA run the spike against [[Benchmark Corpus]].
3. Do not start [[US-010]] until spike notes exist and [[ADR-003 PyMuPDF License]] has an owner and next action.
4. Backend implements API → validation → queue → worker → deletion.
5. Frontend implements upload → stages → result → failures → a11y.
6. QA/security verify before any public claim.
