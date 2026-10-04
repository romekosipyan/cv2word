---
type: spec
id: SPEC-UI
tags:
  - spec
  - ui
aliases:
  - SPEC-UI
---

# SPEC-UI — Converter experience

Owner role: [[Frontend Developer]]. Design: [[UX Designer]]. Copy: [[Product Owner]].

Implements [[UX Contract]]. Marketing chrome: [[SPEC-SEO]]. A11y: [[SPEC-A11Y]].

## Screens

1. **Landing / converter** — tool above the fold, limits, warning, privacy summary, synthetic before/after.
2. **Processing** — named stages only: Uploading, Waiting, Converting, Checking output.
3. **Result** — download, warnings, expiry, delete, convert another.
4. **Failure / expiry / unsupported** — actionable, no parser internals.

## Interaction rules

- Explicit start. Choosing a file is not starting conversion.
- Client validation is advisory. Server validation is authoritative.
- Prevent double submit. One active job per session.
- Cancellation available from waiting/converting.
- Credentials survive same-tab reload only. Never put them in the URL.
- Closing the tab is not deletion. Copy must say the job expires automatically.
- Download click does not delete. Allow retry until expiry or user delete.
- Distinguish "file ready" from "user saved the file."

## Copy constraints

Use [[Claims and Non Goals]]. Required warning: *Formatting may change. Review your resume after conversion.* Primary CTA: *Convert resume to Word.*

## Progressive loading

Keep marketing content server rendered. Load converter code progressively so [[Landing Page]] Core Web Vitals stay in budget.

## Motion polish

Direction and tokens: [[Motion Design Direction]]. Story: [[US-120]].

- Animate real state changes only: file selected, stage transitions among Uploading / Waiting / Converting / Checking output, result/failure panel enter, download press, delete in-progress → confirmed, convert another reset.
- Timing: snappy-professional (≈80–320ms). CSS `transform`/`opacity` preferred. Do not block Convert, Cancel, Download, or Delete on animation completion.
- Forbidden: fake percentages, scroll-depth % as progress, scrollytelling that buries the tool, bounce/confetti, seizure-risk flashes, claim-implying celebration.
- `prefers-reduced-motion: reduce` → instant state swaps; keep live regions and focus moves ([[SPEC-A11Y]]).
- Motion work must not regress progressive-loading or Core Web Vitals budgets on the landing converter.

## Events

Emit only the catalog in [[SPEC-EVENTS]]. No filenames, tokens, or raw URLs.
