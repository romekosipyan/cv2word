---
type: story
id: US-070
title: Conversion fidelity spike
status: done
priority: P0
epic: "[[E01 Feasibility]]"
requirement: R02
spec: "[[SPEC-FIDELITY]]"
assignee_role: tech-lead
plan_week: week-1
estimate: L
depends_on: []
tags:
  - story
  - p0
  - spike
aliases:
  - US-070
---

# US-070 Conversion fidelity spike

As engineering and QA, I want a measured spike on the rights-cleared corpus so we know whether pdf2docx plus PyMuPDF can recover editable resume structure.

## Links

- Epic: [[E01 Feasibility]]
- Requirement: R02 in [[MVP Priorities]]
- Spec: [[SPEC-FIDELITY]]
- Role: `tech-lead` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-1
- Depends on: None
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Given the 30 simple baseline fixtures, when the spike harness runs, then character recall, precision, and critical-fact checks are recorded per file.
- [x] Given two-column fixtures, when evaluated, then pass rate is reported separately from simple files.
- [x] Given scanned or mixed rejection fixtures, when inspected, then low text density is detected and P0 rejection is recommended.
- [x] A note on the story lists engine versions, failures by layout class, and a go/narrow/stop recommendation.

## Implementation notes

Do not tune on the held-out subset. Do not store real personal data. See [[Benchmark Corpus]].

Harness: `workers/convert/spike/`. Synthetic `example.test` identities only. Held-out list in `workers/convert/spike/fixtures/held_out.json`.

## Evidence

- Reviewer: **qa-engineer — PASS** (2026-10-03). Story stays `in-review` pending Done move by orchestrator/release process. Kanban not edited by QA.
- Smoke re-run: `python harness.py` in `workers/convert/spike` (2026-10-03T17:01:14Z) reproduced per-class pass rates and GO decision; pins match `requirements.txt` (PyMuPDF `1.28.2`, pdf2docx `0.5.13`, python-docx `1.2.0`).
- Tests / fixtures: 47 synthetic PDFs (30 simple, 8 two-column, 3 complex, 6 scanned/mixed). Gap vs 60-file QA corpus: 0 simple, 7 two-column, 2 complex, 4 scanned. Held-out: simple-025–030, two-column-07–08, complex-03, scanned-05–06. Full tables: `workers/convert/spike/RESULTS.md`
- Engine versions: PyMuPDF `1.28.2`, pdf2docx `0.5.13`, python-docx `1.2.0` (Python 3.11.0)
- Per-class headline (eval / held-out, not blended):
  - Simple: 24/24 and 6/6 pass; recall and precision min 1.0 on this synthetic set; native body text 30/30
  - Two-column: 6/6 and 2/2 pass; marker order `LLLRRR`; no interleave on these files
  - Complex: 2/2 and 1/1 pass on *visible* source text; overlapping drawings can clip jobs in the source; not a P0 support class
  - Scanned/mixed: 4/4 and 2/2 correctly detected; full-scan recall 0; mixed pages can emit partial native text and must still fail
- Scan-detection recommendation: reject when any page has fewer than 80 non-whitespace characters; fail mixed/image-only with `scan_detected`; no OCR in P0
- Go / narrow / stop: **GO** to continue P0 text-PDF engineering. Two-column stays a warned path until [[US-090]]. Complex is unsupported. Scans rejected. Do not start [[US-010]] worker image work until [[ADR-003 PyMuPDF License]] / [[US-071]] has an owner. Do not start P1 OCR.
- ADR-004: findings recorded; recommendation **pin 0.5.13, do not fork yet**; status remains `open`
- Claim check against [[Claims and Non Goals]]: no perfect-layout, ATS, or 100% accuracy claims. 99% gates stay planning assumptions until [[US-090]]. Required review warning still applies. PyMuPDF license not chosen here (ADR-003 still `open`).

### QA findings

**Critical**

- None. All four acceptance criteria are evidenced. Results are by layout class (not blended). Fixtures are synthetic (`example.test` / NANP `555`). Held-out ids are scored only; harness comments and `held_out_policy` state thresholds were tuned on eval. Scan path recommends `scan_detected` with no OCR; mixed pages still fail detection AC even when partial native text appears. GO is claim-safe. Corpus gap (13 files) and spike-authored-PDF caveat are documented. ADR-004 remains recommendation/`open`; ADR-003 not decided here.

**Warning**

- Perfect 1.0 recall/precision on spike-authored PDFs is optimistic; do not treat US-070 as launch-gate proof. [[US-090]] still owns the full 60-file corpus and third-party variety.
- Two-column stress is shallow: every fixture reports the same `LLLRRR` marker pattern (3L/3R). Harder real two-column layouts remain unproven.
- Scan rule in code gates on `<80` page chars only; density `0.00015` is recorded/mentioned as a supporting signal but is not part of the detect predicate. P0 implementers must not assume density is enforced unless they wire it.
- Complex class “pass” means visible-text scoring passed — not P0 support. Keep product scope narrow.

**Suggestion**

- Close the 13-file corpus gap (esp. two-column + scanned variety, pages up to 5) under [[US-090]] / [[Benchmark Corpus]] before any public fidelity numbers.
- Native DOCX text is checked; Word/LibreOffice open-edit ([[US-094]]) and visual clipping ([[US-073]]) remain out of this spike — schedule before launch claims.
- After Done, [[US-071]] (ADR-003) and [[US-073]] may unlock; [[US-010]] still blocked until ADR-003 has an owner. ADR-004 human pin/fork decision can stay open without blocking US-070 Done.
