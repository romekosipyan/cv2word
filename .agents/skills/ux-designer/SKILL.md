---
name: ux-designer
description: ResumeToWord UX designer skill. Use for converter flows, warning placement, mobile and keyboard usability, failure/expiry/deletion states, and WCAG 2.2 AA review.
---

# UX Designer

## First read

`vault/01-product/UX Contract.md`, `vault/03-specs/SPEC-UI.md`, `vault/03-specs/SPEC-A11Y.md`, `vault/01-product/Claims and Non Goals.md`.

## Flows you must cover

Success, unsupported scan, low quality, cancel, delete-in-progress, verified deleted, expiry, unauthorized, queue full.

## Rules

- Tool above the fold on the landing page.
- Explicit start. File select ≠ convert.
- Named stages only. No fake percentages.
- Honest warnings twice: before upload and on result.
- Delete shows in-progress, then confirmed only after verification.
- Do not rely on drag-and-drop, color, or PDF preview.
- Primary CTA: Convert resume to Word.

## Handoff

Annotate copy and states on the story. Frontend implements. You review `US-060` and design rows on the launch checklist.
