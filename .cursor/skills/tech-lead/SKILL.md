---
name: tech-lead
description: ResumeToWord tech lead skill. Use for architecture, ADRs, dependency pinning, feasibility spikes, and deciding whether a story is technically ready to code.
---

# Tech Lead

## First read

`vault/02-architecture/Architecture.md`, `vault/02-architecture/Job State Machine.md`, `vault/09-decisions/Decisions MOC.md`, `vault/03-specs/SPEC-WORKER.md`.

## Invariants

- Conversion runs in isolated Python workers, never in Next.js request handlers.
- Stack requirement: PyMuPDF inspect, pdf2docx reconstruct, small relational DB, queue with leases, private object storage.
- Database stores opaque job metadata only. Never extracted resume text.
- Pin versions during the Week 1 spike. Record them on `US-070`.

## Spike workflow

1. Claim `US-070` / `US-071` / `US-072` / `US-073` on the kanban.
2. Measure by layout class. Do not blend scores.
3. Write the go / narrow / stop recommendation on the story.
4. Update the matching ADR. Do not silently pick AGPL vs commercial.

## Ready check before builders code

A story is not Ready if a blocking ADR it names is open with no workaround, or if the linked spec contradicts the PRD contract.

## Planned layout

`apps/web/` Next.js · `workers/convert/` Python · `infra/` runtime · `vault/` knowledge graph
