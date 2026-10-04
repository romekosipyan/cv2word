---
type: product
tags:
  - product
  - ux
aliases:
  - UX Contract
---

# UX contract

Implements [[Product Vision]] and R03/R04. Spec: [[SPEC-UI]]. Accessibility: [[SPEC-A11Y]]. Motion: [[Motion Design Direction]].

## Upload surface

States supported files, limits, privacy summary, and: **Formatting may change. Review your resume after conversion.**

Primary action: **Convert resume to Word**. No email, sign-up, or hidden checkout in P0.

Do not rely on drag-and-drop, color, or a PDF preview alone.

## Processing

Show actual stages only: **Uploading**, **Waiting**, **Converting**, **Checking output**. No invented percentage progress. Prevent double submissions. Allow cancellation.

Explain that closing the tab does not instantly delete a job; it still expires automatically. Job credentials may survive a reload in the same tab but must never appear in URLs or analytics.

## Result

- Download editable DOCX
- Observed warnings
- Expiry time
- Delete my files
- Convert another resume

Distinguish server preparation of a download from evidence that the user saved or opened it. Do not delete immediately after initiating a download. Permit retries until expiry or user deletion.

## Alternate flows

| Situation | Behavior |
|---|---|
| Unsupported scan | Explain that a text-based PDF is needed in P0. Offer OCR only when [[US-080]] is shipped, with limits and any price before opt-in. |
| Low quality | Specific warnings (font substitution, possible column order). Block if text is empty or a page was omitted. |
| Delete or cancel | Revoke access immediately, show deletion in progress, confirm after storage and worker cleanup. Never claim deleted while merely queued. |
| Expired result | Neutral expiry message and a fresh upload action. Lost session credentials cannot be recovered by email in P0. |

## Motion

Direction: [[Motion Design Direction]].

Use purposeful, slightly snappy-professional motion to guide attention through upload → named stages → result. Prefer micro-interactions and stage/panel transitions over decorative scroll narratives.

Motion must preserve this contract: tool above the fold; explicit start; named stages only (no fake percentages); dual fidelity warnings; delete in-progress then verified; Convert resume to Word as primary CTA. Honor `prefers-reduced-motion`; motion is never required to understand state.

## Accessibility and mobile

Keyboard upload, visible focus, screen reader labels, live status announcements, readable contrast, buttons that work on small screens. Target WCAG 2.2 AA verification for the core workflow. See also [[SPEC-A11Y]] motion rules and [[Motion Design Direction]] reduced-motion fallbacks.
