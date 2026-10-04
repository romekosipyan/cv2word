---
type: decision
id: ADR-005
status: proposed
tags:
  - adr
aliases:
  - ADR-005 Font Policy
---

# ADR-005 Font policy

## Status

proposed — QA recommendation from [[US-073]]. Product/tech must confirm before treating as accepted. Implementation lands in [[US-011]] / worker validation; editor proof in [[US-094]].

## Context

DOCX resumes must stay editable native text. Workers must not redistribute commercial font binaries pulled from PDFs. [[SPEC-WORKER]] requires approved substitutions and warnings when spacing may change. [[US-070]] showed soft-hyphen / hyphen glyph quirks on some fonts; spacing may change even when character recall stays high.

## Decision (proposed P0)

### Hard rules

1. **Never embed font files** in output DOCX (`word/fonts/*`, `EmbedTrueTypeFonts`, or equivalent). Reference fonts by family name only.
2. **Restricted fonts are never embedded.** Restricted = any font binary from the source PDF, any font whose license forbids redistribution/embedding, Adobe Pro families (e.g. Myriad, Minion, Adobe Garamond), and any family not on the approved reference list below.
3. **Unknown or restricted families are substituted** to an approved base font. Conversion continues if text completeness still passes; attach warnings per the table below.
4. Warnings are **indicators**, not confidence scores ([[SPEC-FIDELITY]], [[Claims and Non Goals]]).

### Approved base fonts (reference by name)

These names may appear in DOCX runs. The worker image does **not** ship their binaries.

| Role | Word-oriented name | LibreOffice-oriented equivalent (metric-compatible) |
|---|---|---|
| Default sans / body | Calibri | Carlito (or Liberation Sans if Carlito absent) |
| Generic sans | Arial | Liberation Sans |
| Serif | Times New Roman | Liberation Serif |
| Monospace | Courier New | Liberation Mono |
| Serif alternate | Georgia | Liberation Serif (spacing may differ — warn) |

P0 default body fallback when the PDF family is unknown: **Calibri**.

### Substitution table (normalized PDF family → DOCX)

Match case-insensitively; strip `MT`, `PS`, `Regular`, style suffixes, and subset prefixes (e.g. `ABCDEF+`).

| Source family (examples) | DOCX font name | Warn? |
|---|---|---|
| Calibri, Carlito | Calibri | No (identity / metric-safe) |
| Arial, Helvetica, Helvetica Neue, Helvetica-Bold, Liberation Sans, Nimbus Sans | Arial | No for Arial↔Liberation Sans; **yes** for Helvetica* → Arial (`font_substituted`) |
| Times New Roman, Times, Times-Roman, Liberation Serif, Nimbus Roman | Times New Roman | No for Times New Roman↔Liberation Serif; **yes** for Times / Nimbus → Times New Roman |
| Courier New, Courier, Liberation Mono, Nimbus Mono | Courier New | No for Courier New↔Liberation Mono; **yes** for Courier → Courier New |
| Georgia | Georgia | No on Word; **yes** on paths that map to Liberation Serif only |
| Cambria, Constantia, Palatino, Garamond, Book Antiqua | Times New Roman | **Yes** — metrics differ |
| Verdana, Tahoma, Trebuchet MS, Gill Sans, Futura, Optima, Myriad*, Montserrat, Lato, Roboto, Open Sans, Source Sans* | Arial | **Yes** |
| Consolas, Menlo, Monaco, Source Code Pro | Courier New | **Yes** |
| Comic Sans MS, Impact, Papyrus, Brush Script, decorative / display / dingbat / symbol-only body text | Arial (dingbats → omit private-use glyphs; keep text if Unicode exists) | **Yes** |
| Any other / custom / Type3 / embedded-only designer face | Calibri | **Yes** |

`*` Adobe and other commercial families: substitute only; never embed.

### When to warn

Attach machine-readable warning codes on the job (surface copy owned by [[US-022]]). Continue only if text completeness still passes.

| Code | Trigger | User-facing intent |
|---|---|---|
| `font_substituted` | Any non-identity mapping from the table, or editor-matrix path that cannot keep the Word-oriented name | Formatting/spacing may change; review layout |
| `font_metrics_risk` | Substituted family is known wider/narrower than source (Helvetica→Arial optional; condensed/expanded/narrow/wide source styles; Cambria/Garamond/custom→base) | Line wraps and page breaks may change |
| `glyph_missing` | After substitution, a needed codepoint has no glyph in the chosen base font (or maps to `.notdef`) | Some characters may show as boxes or omit; review carefully |
| `hyphen_encoding` | Source uses soft hyphens (`U+00AD`) or other hyphen codepoints where ASCII hyphen was expected ([[US-070]] note) | Phone numbers and wraps may look different; content digits still present |

Do **not** warn for identity mappings (Calibri→Calibri, Arial→Arial, Times New Roman→Times New Roman, Courier New→Courier New).

Do **not** treat warnings as a reason to fail the job when recall/precision gates still pass. Fail only under [[US-011]] integrity rules (`output_invalid`, macros, omitted pages, etc.).

### Worker implementation notes (for [[US-011]])

- Strip any font table pdf2docx/python-docx would embed; assert DOCX package has no `word/fonts/` parts before success.
- Prefer declaring the Word-oriented name from the table so desktop Word uses installed fonts; LibreOffice applies its own substitutes on the matrix OS.
- Log only font **family names and warning codes** — never font file bytes or resume text.
- Soft-hyphen normalization may rewrite `U+00AD` → `U+002D` for phone-like tokens; if rewritten or left as soft hyphen inconsistently, emit `hyphen_encoding`.

## Consequences

- P0 will not look pixel-identical on designer fonts; that is allowed ([[Claims and Non Goals]]).
- [[US-011]] must enforce never-embed and attach substitution warnings.
- [[US-094]] verifies editability under [[ADR-006 Editor Versions]], not font binary presence.
- Product may later expand the allowlist; embedding stays forbidden unless a new ADR licenses specific fonts into the worker image.

## Alternatives considered

| Option | Why not for P0 |
|---|---|
| Embed subset fonts from PDF | License risk; redistribution of restricted faces |
| Ship Microsoft/Liberation fonts in the worker image | Licensing and image size; not required if DOCX references system fonts |
| Map everything to a single font | Unnecessary fidelity loss on common Arial/Times/Calibri resumes |
