---
type: plan
tags:
  - plan
  - kickoff
aliases:
  - Kickoff
---

# Kickoff

Agents start here after [[00 Home]].

## Human setup

1. Open `vault/` in Obsidian. Install Kanban and Dataview.
2. Open [[SDLC Kanban]].
3. In Cursor, keep `AGENTS.md` as the project operating manual.

## First agent turn

Invoke `sdlc-orchestrator`. It should assign these **Ready** cards in parallel:

- [[US-070]] Conversion fidelity spike — `tech-lead` + `qa-engineer`
- [[US-072]] Hosting queue storage and cost spike — `devops-sre` + `tech-lead`

Then, without blocking the spike:

- [[US-071]] PyMuPDF license route — needs a human reviewer named on [[ADR-003 PyMuPDF License]]
- [[US-073]] Font policy and editor matrix — `qa-engineer`

## Do not do yet

- Do not scaffold paid OCR or accounts.
- Do not implement `US-010` until spike notes exist.
- Do not collect real resumes. Corpus is synthetic and rights-cleared.
- Do not publish worker images before the license ADR has a decision path.

## After the spike

Orchestrator moves Week 2 **Spec Ready** cards to **Ready** only if [[ADR-002 Hosting Store and Queue]] has a recommendation. Backend spine first (`US-003` → `US-002` → `US-012` → `US-013` → `US-010`), then frontend (`US-001` onward).
