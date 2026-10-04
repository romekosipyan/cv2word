---
type: decision
id: ADR-004
status: accepted
chosen_option: pin-0.5.13-no-fork
human_reviewer: tech-lead (accepted from US-070 recommendation 2026-10-04)
tags:
  - adr
aliases:
  - ADR-004 pdf2docx Maintenance
---

# ADR-004 pdf2docx maintenance

## Status

**accepted — pin pdf2docx `0.5.13` for P0; do not fork yet.** Accepted 2026-10-04 from the [[US-070]] engineering recommendation. No spike evidence required a maintained fork before convert-worker implementation.

| Field | Value |
|---|---|
| `human_reviewer` | tech-lead (2026-10-04) |
| Chosen route | **Pin PyPI pdf2docx `0.5.13`** — no internal or community fork for P0 |
| Revisit trigger | Concrete reconstruction defect in [[US-010]] or [[US-090]] that upstream will not take |

## Context

pdf2docx extracts with PyMuPDF, parses layout with rules, and writes DOCX via python-docx ([S1](https://pdf2docx.readthedocs.io/en/latest/)). Engineering must decide whether the pinned library is sufficient or a maintained fork is required after [[US-070]].

Artifex states that **pdf2docx is no longer actively maintained** and has relicensed the project MIT so the community can fork it. PyPI release used in the spike and accepted for P0: **0.5.13**.

## Spike findings ([[US-070]], 2026-10-03)

Pinned runtime: PyMuPDF `1.28.2`, pdf2docx `0.5.13`, python-docx `1.2.0`. Local harness only. No worker image.

| Class | Spike n (eval / held-out) | Headline |
|---|---|---|
| Simple | 24 / 6 | Planning-assumption text gates passed on this synthetic set. Native DOCX body text. No blended score. |
| Two-column | 6 / 2 | Text gates passed separately. Marker order `LLLRRR` (column then column), no `LRLR` interleave on these 8 files. |
| Complex graphic | 2 / 1 | Visible source text recovered as native DOCX. Overlapping drawings can clip jobs in the source itself. Not a supported P0 class. |
| Scanned / mixed | 4 / 2 | Low text density detected on every rejection fixture. P0 should `scan_detected`, no OCR. |

No reconstruction bug on this corpus required a code patch inside pdf2docx. Soft-hyphen glyph differences appeared with some fonts; that is a scoring/encoding quirk, not a fork trigger.

These PDFs were authored by the spike. That is easier than third-party designer exports. [[US-090]] still owns launch-gate measurement.

## Decision

**Pin pdf2docx `0.5.13` for P0. Do not fork yet.**

[[US-010]] may implement convert against this pin. Maintenance risk remains (Artifex is not actively maintaining the package). Fork, community fork adoption, or an internal fork is deferred until a concrete reconstruction defect appears that cannot be handled without patching pdf2docx and upstream will not take the fix.

## Residuals

- Revisit this ADR if [[US-010]] or [[US-090]] hits a reconstruction defect that requires patching pdf2docx.
- Track upstream inactivity as a known P0 risk; not a blocker for convert-worker coding.
- Alternatives for a later decision: stay pinned, adopt a community fork, or create an internal fork.

## License note

PyMuPDF license is a separate decision: [[ADR-003 PyMuPDF License]] (**accepted** AGPL). This ADR does not choose AGPL vs commercial and does not reopen that route. pdf2docx itself is MIT under the current Artifex relicensing statement.
