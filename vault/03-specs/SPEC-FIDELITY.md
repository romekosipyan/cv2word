---
type: spec
id: SPEC-FIDELITY
tags:
  - spec
  - fidelity
aliases:
  - SPEC-FIDELITY
---

# SPEC-FIDELITY — Quality contract

Owner role: [[QA Engineer]]. Product claims: [[Product Owner]]. Engine: [[Backend Developer]].

## Priority order

Text completeness → reading order → editability → then visual similarity.

Preserve headings, bullets, paragraph boundaries, links, images, spacing, and columns where feasible. Fonts, line breaks, page counts, tables, icons, and complex sidebars may change.

## Proposed launch gates

Planning assumptions until [[US-090]] records measured results.

| Dimension | Proposed gate |
|---|---|
| Text completeness | ≥99% normalized character recall on each simple baseline file; whitespace normalized; accents and numbers retained |
| Precision | ≥99% character precision; detect duplicated text |
| Critical facts | 100% correct names, emails, phones, dates, employers on baseline fixtures |
| Editability | All recovered body text is native DOCX text; reviewers can edit and save role descriptions |
| Reading order | No cross-column interleaving on supported baseline files; two-column pass rate reported separately |
| Visual usability | ≥90% of simple fixtures have no clipping, overlap, or unreadable content in Word and LibreOffice |
| Compatibility | All successful outputs open without repair in the selected editor matrix |
| Unsupported content | Every scanned or mixed rejection fixture is stopped with a clear explanation in P0 |

## Evaluation rules

- Character recall alone is insufficient.
- Human review confirms critical fields and semantic order.
- Test DOCX editing, not just ZIP integrity.
- Report by layout class, never a single blended success rate.
- Warning heuristics are indicators, not confidence scores.
- P1 OCR needs a new benchmark. It must not inherit text-PDF claims.

## Corpus

QA owns a rights-cleared set of 60 resumes: 30 simple text-based, 15 two-column, 5 complex graphic, 10 scanned/mixed for P0 rejection. Include A4 and Letter, 1–5 pages, accents, ligatures, links, varied fonts. Synthetic personal details. Held-out subset. Do not tune on every sample. See [[Benchmark Corpus]].
