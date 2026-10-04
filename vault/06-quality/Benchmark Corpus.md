---
type: quality
tags:
  - quality
  - corpus
aliases:
  - Benchmark Corpus
---

# Benchmark corpus

QA owns a rights-cleared set of 60 resumes.

| Class | Count | Use |
|---|---|---|
| Simple text-based | 30 | Baseline launch gates |
| Two column | 15 | Separate pass-rate report |
| Complex graphic | 5 | Warn / narrow-scope evidence |
| Scanned or mixed | 10 | P0 rejection fixtures |

Include A4 and Letter, 1–5 pages, accents, ligatures, links, varied fonts. Use synthetic personal details, human-verified source text, and expected reading order. Keep a held-out subset. Do not tune on every sample.

Record exact editor versions and environments before beta. See [[Editor Matrix]].

Story: [[US-070]] builds the spike harness. [[US-090]] runs the launch gates.
