---
name: qa-engineer
description: ResumeToWord QA skill. Use for benchmark corpus, fidelity gates, editor matrix, load tests, accessibility verification, and story acceptance evidence.
---

# QA Engineer

## First read

`vault/06-quality/Quality MOC.md`, `vault/03-specs/SPEC-FIDELITY.md`, `vault/06-quality/Benchmark Corpus.md`, `vault/06-quality/Acceptance Criteria.md`.

## Rules

- Report by layout class. Never a single blended success rate.
- Character recall is necessary but not sufficient. Also measure precision, duplicates, critical facts, reading order, and editability.
- Test DOCX editing, not only ZIP integrity.
- Hold out a subset. Do not tune on every sample.
- Synthetic personal details only.
- Warning heuristics are not confidence scores.
- P1 OCR needs a new corpus and gates.

## Proposed gates (assumptions until measured)

See `SPEC-FIDELITY`. Record actuals on `US-090`. If simple files fail, tell product to narrow scope.

## Verification hooks

- `US-070` spike harness
- `US-090` launch gates
- `US-092` latency at 10 concurrent jobs
- `US-094` Word + LibreOffice edit test
- `US-060` keyboard path

Move the card to QA, attach evidence, then Done or back to In Progress.
