# US-070 conversion fidelity spike results

Local harness only. Not a production worker. Scores are **not** blended across layout classes.
Gates of 99% recall/precision are [[SPEC-FIDELITY]] planning assumptions, not public claims.
Do not claim perfect layout, ATS compatibility, or 100% accuracy.

These PDFs were authored by the spike itself. That is easier than third-party designer exports. [[US-090]] still owns launch-gate measurement on the full QA corpus.

## Engine versions

| Package | Pinned | Runtime |
|---|---|---|
| PyMuPDF | `1.28.2` | `1.28.2` |
| pdf2docx | `0.5.13` | `0.5.13` |
| python-docx | `1.2.0` | `1.2.0` |

Python `3.11.0`. Ran `2026-10-03T17:01:14Z`.

PyMuPDF license is still open: [[ADR-003 PyMuPDF License]] / [[US-071]]. This spike does not pick AGPL vs commercial. Do not publish a worker image.

## Fixtures

Synthetic identities only (`example.test`, NANP `555` numbers). Held-out ids were scored but not used to tune scan thresholds.

| Class | Spike n | QA corpus target | Gap | Held-out |
|---|---:|---:|---:|---|
| Simple text | 30 | 30 | 0 | simple-025–030 |
| Two-column | 8 | 15 | 7 | two-column-07–08 |
| Complex graphic | 3 | 5 | 2 | complex-03 |
| Scanned / mixed | 6 | 10 | 4 | scanned-05–06 |
| Total | 47 | 60 | 13 | see `fixtures/held_out.json` |

A4 and Letter, 1–3 pages, accents, ligature codepoints, and links are represented in the simple set. The remaining gap vs the 60-file QA corpus is more two-column, complex, and scanned variety plus two extra pages on some classes — owned by [[US-090]] / [[Benchmark Corpus]].

## Simple text

| Split | n | Pass | Fail | Recall min / median | Precision min / median | Critical facts | Native text | Scan detect |
|---|---:|---:|---:|---|---|---:|---:|---:|
| eval | 24 | 24 | 0 | 1.0 / 1.0 | 1.0 / 1.0 | 24/24 | 24/24 | 24/24 |
| held-out | 6 | 6 | 0 | 1.0 / 1.0 | 1.0 / 1.0 | 6/6 | 6/6 | 6/6 |

## Two-column (separate from simple)

| Split | n | Pass | Fail | Recall min / median | Precision min / median | Critical facts | Native text | Scan detect |
|---|---:|---:|---:|---|---|---:|---:|---:|
| eval | 6 | 6 | 0 | 1.0 / 1.0 | 1.0 / 1.0 | 6/6 | 6/6 | 6/6 |
| held-out | 2 | 2 | 0 | 1.0 / 1.0 | 1.0 / 1.0 | 2/2 | 2/2 | 2/2 |

Reading-order markers (left column tokens then right). `LLLRRR` is column-then-column. Interleaving would look like `LRLR`.

- `two-column-01` (eval): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-02` (eval): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-03` (eval): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-04` (eval): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-05` (eval): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-06` (eval): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-07` (held-out): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3
- `two-column-08` (held-out): sequence `LLLRRR`, switches=1, interleaved=False, markers L=3/R=3

## Complex graphic

| Split | n | Pass | Fail | Recall min / median | Precision min / median | Critical facts | Native text | Scan detect |
|---|---:|---:|---:|---|---|---:|---:|---:|
| eval | 2 | 2 | 0 | 1.0 / 1.0 | 1.0 / 1.0 | 2/2 | 2/2 | 2/2 |
| held-out | 1 | 1 | 0 | 1.0 / 1.0 | 1.0 / 1.0 | 1/1 | 1/1 | 1/1 |

## Scanned / mixed (P0 rejection)

| Split | n | Pass | Fail | Recall min / median | Precision min / median | Critical facts | Native text | Scan detect |
|---|---:|---:|---:|---|---|---:|---:|---:|
| eval | 4 | 4 | 0 | 0.0 / 0.0 | 0.0 / 0.0 | 0/4 | 1/4 | 4/4 |
| held-out | 2 | 2 | 0 | 0.0306 / 0.2211 | 0.9565 / 1.0 | 0/2 | 1/2 | 2/2 |

## Scan-detection recommendation for P0

Reject when any page has fewer than 80 non-whitespace characters (density below 0.00015 as supporting signal).

P0 must fail mixed or image-only pages with scan_detected. Do not OCR and do not drop the page silently.

Eval scan-detection correctness: 4 / 4.

## pdf2docx maintenance

pdf2docx 0.5.13 is MIT and no longer actively maintained by Artifex.

Pin 0.5.13 for the P0 path unless a concrete reconstruction bug requires a patch. Do not fork pre-emptively. A human must decide pin vs community fork vs internal fork in ADR-004.

Recorded on [[ADR-004 pdf2docx Maintenance]] (status remains `open` pending a human decision).

## Notes that are not launch claims

- Recovered body text on text PDFs was native DOCX runs, not page images.
- Some fonts encode ASCII hyphens as soft hyphens in the PDF. Phone and marker checks use digit / alphanumeric matching so that is not scored as missing content. Spacing and hyphen glyphs may still change.
- Complex fixtures can clip job lines in the source drawing. Facts are scored only when they exist in the source PDF.
- Mixed pages can still emit partial native text from the text page. P0 must still reject the job (`scan_detected`) because the image page would omit content.
- Visual clipping, editor open/repair, and real-resume variety were not measured here ([[US-073]], [[US-094]], [[US-090]]).

## Go / narrow / stop

**GO** — Eval simple fixtures met the planning-assumption text gates, two-column eval passed separately, and scan fixtures were detected.

Continue P0 engineering on text PDFs. Keep two-column as a warned path until [[US-090]]. Do not treat complex-graphic as a supported P0 class. Reject scans in P0. Do not start OCR ([[US-080]]).

PyMuPDF remains AGPL or commercial. This spike does not choose a route. See ADR-003 / US-071. Do not publish a worker image.

## How to rerun

```
cd workers/convert/spike
.venv\Scripts\activate
python generate_fixtures.py
python harness.py
```

Do not paste fixture resume text into vault notes. Metrics only.
