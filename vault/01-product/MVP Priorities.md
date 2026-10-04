---
type: product
tags:
  - product
  - requirements
aliases:
  - MVP Priorities
---

# MVP priorities

P0 is required for public MVP. P1 is the next gated iteration. P2 is later or experimental. OCR is optional, but every advertised OCR feature must pass its own release criteria.

| ID | Priority | Requirement | Primary stories |
|---|---|---|---|
| R01 | P0 | Anonymous single PDF upload with browser and server validation | [[US-001]], [[US-002]] |
| R02 | P0 | Convert supported text-based PDFs into editable DOCX using isolated Python workers | [[US-010]], [[US-011]], [[US-012]] |
| R03 | P0 | Accessible upload, named processing stages, result download, and actionable failures | [[US-004]], [[US-020]], [[US-021]], [[US-060]], [[US-120]] |
| R04 | P0 | Quality warnings, support boundaries, and review checklist; no exact fidelity claim | [[US-022]], [[US-050]] |
| R05 | P0 | Private job access, deletion control, automated expiry, and deletion verification | [[US-030]], [[US-031]], [[US-032]] |
| R06 | P0 | Abuse controls, resource caps, redacted operational metrics, and incident alerts | [[US-040]], [[US-041]], [[US-043]] |
| R07 | P0 | Indexable landing page, original support content, canonical URLs, and sitemap | [[US-050]], [[US-051]], [[US-052]] |
| R08 | P1 | Explicit opt-in OCR for scanned or mixed PDFs with separate queue and limits | [[US-080]] |
| R09 | P1 | Simple editable reconstruction fallback with clear disclosure of layout loss | [[US-081]] |
| R10 | P1 | Original and rendered output comparison generated within the same retention window | [[US-082]] |
| R11 | P1 | Validate one optional paid enhancement with price shown before processing | [[US-083]] |
| R12 | P2 | Batch conversion, additional locales, coach accounts, or API after demand validation | later |

## Release principles

- A successful export must contain editable text. A DOCX of only page images fails the product promise.
- No silent fallback may remove content or switch to OCR.
- Uncertain quality must be disclosed. Empty or materially incomplete output must be blocked.
- P0 is usable without payment or account creation.
- P1 monetization must not impose an undisclosed charge after a user uploads a personal document.
