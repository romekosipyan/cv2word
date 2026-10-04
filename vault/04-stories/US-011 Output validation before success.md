---
type: story
id: US-011
title: Output validation before success
status: done
priority: P0
epic: "[[E03 Conversion Engine]]"
requirement: R02
spec: "[[SPEC-FIDELITY]]"
assignee_role: backend-developer
plan_week: week-3
estimate: M
depends_on: ['US-010']
tags:
  - story
  - p0
  - backend
aliases:
  - US-011
---

# US-011 Output validation before success

As the service, I want a validation stage so empty or unsafe DOCX files are never marked successful.

## Links

- Epic: [[E03 Conversion Engine]]
- Requirement: R02 in [[MVP Priorities]]
- Spec: [[SPEC-FIDELITY]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-010]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Empty or materially incomplete text blocks download and returns output_invalid.
- [x] Omitted pages block success.
- [x] Macros, source metadata, attachments, and unsafe external relationships are stripped or rejected.
- [x] Default filename is resume-editable.docx. Font substitution warnings are attached when policy requires.

## Implementation notes

See [[ADR-005 Font Policy]] and [[SPEC-WORKER]].

Implemented under `workers/convert/engine/`:

| Module | Role |
|---|---|
| `validate.py` | Sanitize package + completeness/page gates; `output_invalid` on failure |
| `font_policy.py` | ADR-005 family map → approved names + warning codes |
| `native_check.py` | Native `w:t` floor (unchanged contract) |
| `pipeline.py` | Inspect → convert → validate; delete bad DOCX before return |

Gates (not public 99% claims): overall char recall ≥0.75 vs source PDF; per-page recall ≥0.45; DOCX section/page estimate ≥ expected pages; macros/embedded fonts rejected; metadata/customXml/thumbnail/unsafe `file:` externals stripped; Helvetica fixtures emit `font_substituted` (+ `font_metrics_risk`).

## Evidence

- Reviewer: `code-reviewer` — **PASS** (2026-10-04). Status left `in-review` for `qa-engineer` / `security-engineer`. Kanban not edited.
- Tests / fixtures (2026-10-04):
  - Re-ran `workers/convert/tests/test_validate.py` + `test_pipeline.py` — **13/13 OK** via `spike/.venv`
  - Synthetic fixtures only (`example.test` / `555`); CLI/pipeline JSON has no resume text
- Claim check against [[Claims and Non Goals]]: No empty success; no perfect-layout / ATS / 100% accuracy claims. Font warnings are indicators, not confidence scores. Recall thresholds are worker integrity gates, not public fidelity claims (those remain planning assumptions until [[US-090]]).
- Code-review notes (non-blocking):
  - Warning: pdf2docx still emits INFO lines with absolute PDF paths on stderr during convert despite logger WARNING in `convert.py` (filename/path chatter; not resume body text).
  - Warning: per-page recall skips pages under 80 normalized chars; short unique pages could rely only on overall recall ≥0.75.
  - Warning: DOCX page estimate is sectPr/break based; `docProps/app.xml` is not neutralized (core metadata is).

## QA Evidence

- QA: `qa-engineer` — **PASS** (2026-10-04). Story `status: done`; `assignee_role: backend-developer`. Kanban not edited (orchestrator owns board).
- Unlocks: [[US-020]] (depends on US-011 Done).
- Re-ran `tests.test_validate` + `tests.test_pipeline` via `workers/convert/spike/.venv` — **13/13 OK** (≈1.9s).
- Smoke (CLI / validate):
  - `simple_text.pdf` → `ok:true`, `filename:resume-editable.docx`, `native_chars:256`, warnings `font_substituted` + `font_metrics_risk`; DOCX present with native `w:t` (ZIP editability check, not Word GUI).
  - `image_only.pdf` → `scan_detected`; no DOCX left on disk.
  - Near-empty package → `output_invalid` (not success).
  - Result JSON has no resume body text / no `text`/`content` keys.
- Acceptance mapped (by failure class, not blended rate):
  | Class | Result | Evidence |
  |---|---|---|
  | Empty / low native text | PASS | `test_empty_docx_output_invalid`; smoke near-empty → `output_invalid` |
  | Materially incomplete vs PDF | PASS | `test_materially_incomplete_vs_source_pdf` → `materially_incomplete` |
  | Omitted pages | PASS | `test_omitted_pages_block_success`; multipage fixture `docx_pages≥3` |
  | Macros / unsafe package | PASS | `test_macros_rejected`; metadata/customXml/thumbnail/`file:` stripped; https kept |
  | Default name + font warnings | PASS | pipeline/CLI `resume-editable.docx` + Helvetica → substitution warnings |
  | No empty success (claims) | PASS | Empty/incomplete/scan paths never `ok:true`; PRD/Claims: no perfect-layout/ATS/100% claims; recall gates are worker integrity only |
- Non-blocking (carry from review; not FAIL): pdf2docx stderr path INFO; short-page per-page recall skip; `docProps/app.xml` not neutralized.
