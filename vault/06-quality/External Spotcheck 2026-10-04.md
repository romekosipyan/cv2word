---
type: quality
tags:
  - quality
  - fidelity
  - spotcheck
aliases:
  - External Spotcheck 2026-10-04
---

# External spot-check — 2026-10-04

QA evidence for **10 internet sample / template-demo resume PDFs** converted with the production pdf2docx kwargs (local Python mirror of US-118/US-119 client path).

**Do not treat as a public pass rate.** No blended success percentage. Report is by layout class only.

## Links

- Full evidence: `workers/convert/qa/external-spotcheck/RESULTS.md`
- Manifest: `workers/convert/qa/external-spotcheck/manifest.json`
- Spec: [[SPEC-FIDELITY]]
- Corpus policy: [[Benchmark Corpus]]
- Beta context: [[US-100 Private beta with 20 target users]]
- Synthetic gates (separate): [[US-090 Fidelity launch gates]]

## Layout-class counts (human visual usability)

| Class | N | Convert OK | Visually usable |
|---|---|---|---|
| simple | 4 | 4/4 | ~0–1/4 |
| two_column | 3 | 3/3 | 0/3 |
| complex_graphic | 3 | 3/3 | 0/3 |

Native editable text present in all 10 DOCX; layout fidelity fails on rich templates. Keep required warning copy.
