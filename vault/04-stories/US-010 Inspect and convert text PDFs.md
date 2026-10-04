---
type: story
id: US-010
title: Inspect and convert text PDFs
status: done
priority: P0
epic: "[[E03 Conversion Engine]]"
requirement: R02
spec: "[[SPEC-WORKER]]"
assignee_role: backend-developer
plan_week: week-2
estimate: L
depends_on: ['US-012', 'US-013', 'US-070', 'US-071']
tags:
  - story
  - p0
  - backend
aliases:
  - US-010
---

# US-010 Inspect and convert text PDFs

As a job seeker with a text-based resume PDF, I want an editable DOCX so I can update experience without retyping the document.

## Links

- Epic: [[E03 Conversion Engine]]
- Requirement: R02 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `backend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-012]], [[US-013]], [[US-070]], [[US-071]] / [[ADR-003 PyMuPDF License]] (**accepted** Option A AGPL 2026-10-04)
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Supported text PDFs produce a DOCX whose body text is native editable text, not page images.
- [x] PyMuPDF inspects; pdf2docx reconstructs; conversion does not run in a Next.js request handler.
- [x] No silent OCR and no silent content-dropping fallback.
- [x] Mixed or image-only pages that would omit meaningful content fail with scan_detected.

## Implementation notes

Pins (US-070 spike / ADR-003 Option A AGPL):

| Package | Pin |
|---|---|
| PyMuPDF | `1.28.2` |
| pdf2docx | `0.5.13` |
| python-docx | `1.2.0` |

Engine version string: `pymupdf-1.28.2+pdf2docx-0.5.13`.

No pdf2docx fork required — [[ADR-004 pdf2docx Maintenance]] left open; pin confirmed for P0.

License: [[ADR-003 PyMuPDF License]] accepted AGPL. Do **not** claim a commercial Artifex license. Source-offer and producer-notice residuals remain launch checklist items (not coding blockers).

## Evidence

- Reviewer: `code-reviewer` **PASS** (2026-10-04); `security-engineer` **PASS** (2026-10-04); `qa-engineer` **PASS** (2026-10-04)
- Tests / fixtures (re-run by code-reviewer):
  - `workers/convert/tests/test_pipeline.py` — 5/5 OK via `spike/.venv` (native DOCX `w:t`, image-only + mixed → `scan_detected`, CLI JSON has no resume text)
  - `apps/web/tests/convert-worker.test.ts` — 5/5 OK; `apps/web/tests/queue-leases.test.ts` — 7/7 OK
  - Synthetic fixtures: `workers/convert/tests/fixtures/` + `inspect/fixtures/` (`example.test` / `555` only)
- Implementation:
  - Python: `workers/convert/engine/` (`pipeline`, `cli`, `convert`, `inspect_gates`, `native_check`)
  - Node queue wiring: `apps/web/src/lib/jobs/convert-work.ts`, `worker-runner.ts` (instrumentation poll; spawn `python -m engine`)
  - Image: `workers/convert/Dockerfile` + `infra/convert-worker/docker-compose.convert.yml` tag `LOCAL_AGPL` (do not push until source-offer residuals)
- Claim check against [[Claims and Non Goals]]: No perfect-layout / ATS / 100% accuracy claims. Conversion fidelity remains planning-assumption until US-090. Required review warning unchanged on landing. ADR-003 Option A AGPL documented; pins match US-070; no commercial Artifex claim.
- Launch residuals (documented, not blocking this card): corresponding-source offer, LICENSE/NOTICE, producer-notice vs metadata strip — see ADR-003 compliance list / US-111.

### Code review — PASS

Reviewed against story AC, [[SPEC-WORKER]], [[Claims and Non Goals]], [[Privacy Contract]], and accepted [[ADR-003 PyMuPDF License]] (Option A AGPL). Status remains `in-review`. Kanban not edited.

| Check | Result |
|---|---|
| Conversion outside Next.js request handlers | **Pass** — `completeUploadAsync` inspects + enqueues only; convert via queue lease → `spawn(python -m engine)`. Test: complete-upload leaves `queued` / no DOCX / null `engineVersion`. |
| No silent OCR / content drop | **Pass** — pdf2docx default `ocr=0`; no OCR fallback; mixed/image-only → `scan_detected` before convert; no DOCX written. |
| Success DOCX has native editable text | **Pass** — `native_editable_ok` requires ≥80 `w:t` chars; image-only/empty → `output_invalid`; tests assert `<w:t` in package. |
| License / pins | **Pass** — AGPL labels + pin docs (`1.28.2` / `0.5.13` / `1.2.0`); commercial claim forbidden in README/Dockerfile/`requirements.txt`. |
| Resume text not in logs | **Pass** — CLI/pipeline strip text keys; Node logs jobId/codes only; stderr not forwarded to app logs. |

Non-blocking: pdf2docx still prints progress INFO (paths) to Python stderr despite logger quieting — ops should not treat container stderr as clean. Full package/macro/metadata validation remains [[US-011]].

### Security review — PASS

Reviewed convert worker path against [[SPEC-WORKER]], [[SPEC-SECURITY]], [[Privacy Contract]], [[Threat Model]], and accepted [[ADR-003 PyMuPDF License]] (Option A AGPL). Kanban unchanged; story remains `in-review`.

| Check | Result |
|---|---|
| Conversion isolated from Next.js request handlers | **Pass** — `completeUploadAsync` inspects + enqueues only; pdf2docx runs via queue lease → `spawn(python -m engine)` (`convert-work.ts` / `worker-runner.ts`). Instrumentation starts the poll loop; handlers never call convert. Test: complete-upload leaves job `queued` with no DOCX. |
| No resume text in logs | **Pass** — engine/CLI strip text-like keys; convert exceptions omit message text; Node logs `jobId` + error/engineVersion only; child stderr captured and discarded (not logged). Pipeline test asserts fixture contact strings absent from CLI stdout/stderr. |
| Job secret not leaked via worker logs/events | **Pass** — queue body is `jobId` + `outputObjectKey` only (`assertSafeQueuePayload`); convert path never receives bearer secret; `emitEvent("conversion_failed", …)` uses sanitized allowlisted props. |
| `scan_detected` fail-closed (no silent OCR) | **Pass** — re-inspect before convert; any page &lt; 80 non-WS chars → `scan_detected` validation (not infra-retried); no OCR install/fallback; mixed/image-only fail without writing DOCX. |
| AGPL path ≠ commercial license claims | **Pass** — Dockerfile labels `AGPL-3.0` + `LOCAL_AGPL` / local-until-source-offer; README/`requirements.txt` forbid commercial Artifex claims; no code path asserts a commercial license. |

Non-blocking residuals (not FAIL for this card): local Node spawn inherits full `process.env` into Python (tighten env allowlist later); ADR-003 source-offer / NOTICE / producer-notice remain launch gates before customer-reachable images; production egress denial remains the ECS/isolation deployment concern (compose engine image already `network_mode: none`).

### QA Evidence — PASS

Verified against story AC, [[SPEC-WORKER]], and [[Claims and Non Goals]]. Kanban not edited. Status → `done`; assignee → `backend-developer`.

| Check | Result |
|---|---|
| Text PDF → DOCX with native editable body text | **Pass** — CLI smoke on `simple_text.pdf`: `ok`, `native_chars=256`, DOCX has 9 `w:t` runs / 292 chars including fixture phrases (Alex / Widget / Experience); `drawing`/`a:blip` = 0 (not page images). Layout class: simple single-column synthetic. |
| PyMuPDF inspect + pdf2docx reconstruct; not in Next.js handler | **Pass** — `engine_version=pymupdf-1.28.2+pdf2docx-0.5.13`; convert-worker test: complete-upload leaves `queued` / no DOCX; convert via queue lease → `python -m engine`. |
| No silent OCR / content-dropping fallback | **Pass** — convert path has no OCR install/fallback; image-only + mixed fail before write; no DOCX on disk. |
| Mixed / image-only → `scan_detected` | **Pass** — CLI + pipeline + convert-worker: both fixtures `error=scan_detected`, `kind=validation`, output absent. |

Re-run (2026-10-04):

- `workers/convert/tests/test_pipeline.py` — **5/5 OK** (`spike/.venv`)
- `apps/web/tests/convert-worker.test.ts` — **5/5 OK**
- `apps/web/tests/queue-leases.test.ts` — **7/7 OK** (dependency wiring still green)

Claim check: no perfect-layout / ATS / 100% accuracy claims exercised. Fidelity remains planning-assumption until [[US-090]]. Word/LibreOffice open-edit matrix remains [[US-094]] (out of scope for this card).

**QA Evidence: PASS**
