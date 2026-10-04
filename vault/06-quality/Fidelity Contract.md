---
type: quality
tags:
  - quality
  - fidelity
aliases:
  - Fidelity Contract
---

# Fidelity contract

Canonical evaluation rules live in [[SPEC-FIDELITY]]. This note is the product-facing summary.

A successful export contains editable native DOCX text. Image-only DOCX fails. Empty or omitted-page output is blocked. No silent OCR. Uncertain quality is disclosed.

Prioritize text completeness, reading order, and editability over visual matching. Reconstructing editable structure from positioned PDF content is inherently approximate.

P1 OCR must not inherit text-PDF claims.
