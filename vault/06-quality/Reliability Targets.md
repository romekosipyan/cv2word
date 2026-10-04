---
type: quality
tags:
  - quality
  - reliability
aliases:
  - Reliability Targets
---

# Reliability targets

Planning assumptions. Measure each independently.

| Target | Proposed value |
|---|---|
| Upload/status/download API availability | 99.5% monthly |
| p95 accepted-queue → ready | <30s for 1–3 page text PDFs at 10 concurrent jobs, excluding upload transfer |
| p95 queue wait | <15s |
| Bounded reject | New jobs rejected if wait would exceed 2 minutes |
| Worker execution cap | 120s P0 / 180s P1 OCR |
| Landing CWV p75 | LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 |

OCR has separate targets and must not reuse these numbers.

Define error budgets and capacity ceilings before broad promotion. Story: [[US-092]].
