---
type: quality
tags:
  - quality
  - editors
aliases:
  - Editor Matrix
---

# Editor matrix

Successful outputs must open without repair in the selected supported desktop Word and LibreOffice versions. Versions below are **proposed** by [[US-073]] / [[ADR-006 Editor Versions]] until [[US-094]] records verified Help → About strings.

Test editing, not only open. Reviewers must be able to edit and save a role description. ZIP integrity alone is not evidence.

## P0 gate editors (proposed)

| Editor | Version | OS | Channel / notes | Status |
|---|---|---|---|---|
| Microsoft Word (Microsoft 365 Apps) | Version **2609** (Build **20430.20092**) | Windows 11 24H2, x64, en-US | Current Channel (published 2026-09-22) | proposed — verify in [[US-094]] |
| LibreOffice Writer | **26.2.6** | Windows 11 24H2, x64, en-US | Mature / Still branch (2026-09-24) | proposed — verify in [[US-094]] |

## Out of P0 gate (optional stretch)

| Editor | Version | OS | Status |
|---|---|---|---|
| LibreOffice Writer | 26.8.x (latest) | Windows 11 x64 | non-blocking |
| Microsoft Word for Mac | latest Microsoft 365 | macOS | non-blocking |
| Word on the web | n/a | browser | out of scope for fidelity gate |

## Font expectations during matrix tests

- Outputs follow [[ADR-005 Font Policy]]: **no embedded fonts** in the DOCX package.
- Word resolves Calibri / Arial / Times New Roman / Courier New / Georgia from the Office/OS install.
- LibreOffice may map those names to Carlito / Liberation families; substitution warnings from conversion are expected when the PDF used other faces.
- Soft-hyphen quirks noted in [[US-070]] may affect visual hyphens; digit content must remain editable.

## Pass criteria (per sample)

1. Opens with no repair / recovery prompt.
2. Body text is selectable native text.
3. Reviewer edits one role description bullet or sentence and saves; reopen shows the edit.
4. No macros; no `word/fonts/` parts (spot-check package).
