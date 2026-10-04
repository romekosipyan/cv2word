---
type: spec
id: SPEC-A11Y
tags:
  - spec
  - a11y
aliases:
  - SPEC-A11Y
---

# SPEC-A11Y — Core workflow accessibility

Owner role: [[UX Designer]], [[Frontend Developer]]. Verification: [[QA Engineer]].

Target: WCAG 2.2 AA on the core upload → process → download → delete flow.

## Must

- Keyboard-operable file picker and all actions. Drag-and-drop is optional enhancement only.
- Visible focus on every interactive control.
- Accessible name on the file input, CTA, cancel, download, delete, and convert-another controls.
- Live region for stage changes and terminal success/failure.
- Contrast that meets AA for text, warning banners, and error text.
- Hit targets usable on small screens. Do not rely on hover.
- Do not convey status by color alone.
- Do not require a PDF preview to complete the task.
- Motion is not required to understand progress or terminal state (see [[Motion Design Direction]]).
- Honor `prefers-reduced-motion: reduce`: disable non-essential transitions, pulsing activity cues, and decorative entrances; keep text labels, live-region announcements, and focus moves.
- No seizure-risk flashes or large-area strobing. Indeterminate activity cues must be subtle and pause under reduced motion.
- Do not rely on hover-only motion for essential feedback; keyboard and touch must see equivalent state.

## Acceptance

A keyboard user can upload, convert, download an editable DOCX, and receive the fidelity warning without registering. Screen reader announces stage changes without leaking job secrets. With reduced motion enabled, the same path remains understandable without animation.
