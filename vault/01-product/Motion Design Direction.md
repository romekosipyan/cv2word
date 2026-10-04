---
type: product
tags:
  - product
  - ux
  - motion
aliases:
  - Motion Design Direction
  - Motion Design
---

# Motion design direction (P0)

Intentional visual/motion direction for ResumeToWord P0. Implements [[UX Contract]], [[SPEC-UI]], and [[SPEC-A11Y]]. Must not contradict [[Claims and Non Goals]].

Craft inspiration (quality of timing/attention guidance only): Nike, Ralph Lauren, Jitter, Sofi, Silo. **Do not copy** Sofi’s wellness aesthetic, pill CTAs, product-hero scrollytelling, or scroll-depth **%** indicators.

Implementation story: [[US-120]].

## Brand motion tone

ResumeToWord is a **practical converter**, not luxury wellness or playful consumer gimmick.

| Axis | Direction |
|---|---|
| Pace | Purposeful, slightly snappy-professional |
| Feel | Polished and smooth; never bouncy, never ultra-slow “luxury” |
| Job | Guide attention through upload → stages → result; never decorate for its own sake |
| Honesty | Motion reinforces real state only — never invent progress |

## Principles

1. **Rhythm over spectacle** — Micro-interactions and stage transitions that clarify what is happening. No empty scroll theater.
2. **Tool first** — Motion must never push the converter below the fold, delay the Convert path, or bury warnings.
3. **Named stages only** — Animate stage *labels* and panel transitions. No fake percentages, determinate bars without real data, or scroll-depth % as conversion progress.
4. **State is readable without motion** — Text, live regions, and layout carry meaning. Animation is enhancement ([[SPEC-A11Y]]).
5. **Performance budget** — Prefer `transform` / `opacity`. No layout thrash, no continuous heavy effects during conversion, no blocking the primary CTA on animation end.
6. **Reduced motion is first-class** — Honor `prefers-reduced-motion: reduce` with instant or near-instant state swaps; keep announcements and focus moves.
7. **Honest delete** — In-progress and verified-deleted are distinct states; do not celebrate “deleted” with a flourish before verification.

## What to animate (scope)

| Surface | Motion | Notes |
|---|---|---|
| Landing / converter above the fold | Subtle CTA hover + press; optional calm brand/mark presence (≤1 short entrance on first paint) | Tool stays primary. No scrollytelling narrative that delays the upload surface. |
| File selected | File name / chip fades or slides in; CTA enables with short state change | File select ≠ convert. Do not auto-start. |
| Pre-upload warning | Static or opacity settle only — never hide, scroll away, or treat as dismissible toast | Required copy stays visible: *Formatting may change. Review your resume after conversion.* |
| Processing stages | Crossfade or short vertical settle between **Uploading**, **Waiting**, **Converting**, **Checking output** | Optional indeterminate activity cue (pulse/opacity on stage chrome). **No %.** |
| Success result | Panel enter (opacity + small Y translate); download CTA emphasis | Show warnings again; no “perfect” flourish. |
| Failure / unsupported / expiry | Same enter pattern as success; neutral, actionable | Map copy from [[Failure Catalog]]; no alarm flash. |
| Download | Press feedback on **Download editable DOCX** | Does not imply user saved/opened the file; does not delete. |
| Delete | Status text/region updates for *deletion in progress* → *confirmed deleted* | Confirm only after verification. No confetti. |
| Convert another | Short reset to upload surface | Clears prior result without account theater. |
| Hover / focus-adjacent | Border/background/transform on interactive controls | Never rely on hover alone ([[SPEC-A11Y]]). |

Out of scope for P0 motion polish: marketing page-long scrollytelling, parallax heroes, Lottie spectacles, cursor-follow effects, fake queue ETAs, celebration confetti, scroll-position percentage UI.

## Timing and easing tokens

Implement as CSS custom properties (names illustrative; keep in `apps/web` design tokens / `globals.css`).

| Token | Value | Use |
|---|---|---|
| `--motion-duration-instant` | `80ms` | Color/border hover |
| `--motion-duration-fast` | `140ms` | Button press, enable/disable, chip appear |
| `--motion-duration-base` | `220ms` | Stage crossfade, panel enter/exit |
| `--motion-duration-emphasized` | `320ms` | Result/failure panel reveal only (cap; do not go slower) |
| `--motion-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default snappy-professional |
| `--motion-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exits / dismiss |
| `--motion-ease-enter` | `cubic-bezier(0, 0, 0, 1)` | Enters / settles |
| `--motion-distance-sm` | `4px` | Press / stage nudge |
| `--motion-distance-md` | `8px` | Panel enter translateY |

Rules:

- Cap any single UI transition at **320ms**.
- No spring/bounce easings in P0.
- Looping indicators (if any) must be subtle, pause under reduced motion, and never encode a percentage.
- Stagger only for distinct sequential UI (e.g. result actions); max stagger total **120ms**.

## Reduced-motion fallbacks

When `prefers-reduced-motion: reduce`:

- Set animation/transition durations to `0` or `≈0.01ms` (existing pattern in `globals.css` is acceptable).
- Swap stages and panels instantly; keep `aria-live` announcements and programmatic focus moves from [[US-060]].
- Disable press transforms, pulsing activity cues, and decorative entrances.
- Do **not** remove required warnings, stage names, or delete in-progress/confirmed copy.

Motion must not be the only cue for: busy/disabled CTA, current stage, success vs failure, deletion in progress vs confirmed, expiry.

## Anti-patterns (do not ship)

- Fake or decorative **percentages** (including Sofi-style scroll `0%` used as conversion progress).
- Determinate progress bars without a real, trustworthy fraction from the pipeline.
- Scrollytelling or long motion narratives that bury the tool or the dual fidelity warnings.
- Blocking Convert / Cancel / Download / Delete until an animation finishes.
- Layout thrash (animating `height`/`top`/`width` of large regions) that janks during conversion.
- Seizure-risk flashes, rapid full-screen blinks, or large area strobing (WCAG 2.2 AA).
- Playful gimmicks: confetti, mascots, rubber-band bounce, “slot machine” stage flips.
- Implying pixel-perfect layout, ATS success, or verified download/open via motion or copy.
- Account, email, or checkout theater dressed up as onboarding animation.

## Frontend handoff (implementable)

1. Add motion tokens above; reuse for converter controls in the client island — do not load a heavy animation library for P0 unless already justified; CSS (+ optional small Web Animations) preferred.
2. Wire stage changes to the existing named-stage machine ([[US-004]] / client path [[US-115]]/[[US-119]]): animate label/panel only when the stage string actually changes.
3. Keep progressive loading: marketing SSR stays light; motion on converter controls must not regress LCP/INP budgets on [[Landing Page]] ([[SPEC-UI]] progressive loading).
4. Primary CTA label remains **Convert resume to Word**; press/hover styles only.
5. Delete flow: visible *in progress* → *confirmed* after verification; motion may soften the swap but must not skip the in-progress state.
6. Verify with keyboard + screen reader + `prefers-reduced-motion` enabled before calling the story done ([[SPEC-A11Y]], [[US-060]] patterns).
7. QA spot-check: no % anywhere in processing UI; warnings visible before upload and on result; tool above the fold at `320px`/`768px`/`1280px` widths.

## Acceptance snapshot for [[US-120]]

- Tokens documented in CSS and used consistently on converter interactions.
- Stage, result, failure, delete, and convert-another transitions follow this note.
- Reduced-motion path passes; motion not required to understand state.
- No fake progress %, no blocked CTAs, no claim regressions.
