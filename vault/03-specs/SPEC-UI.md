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

## Events

Emit only the catalog in [[SPEC-EVENTS]]. No filenames, tokens, or raw URLs.
