# External resume PDF fidelity spot-check

**Date:** 2026-10-04  
**Role:** QA Engineer  
**Related:** US-100 (beta evidence), US-118/US-119 (client pdf2docx), US-090 (synthetic gates — not this corpus)

## Environment

| Item | Value |
|---|---|
| OS | Windows 10 (win32 10.0.26200) |
| Converter path | **Local Python** `pdf2docx==0.5.13` + `pymupdf==1.28.2` via `workers/convert/.venv`, using the same convert kwargs as production client/worker (`parse_stream_table=False`, `float_image_ignorable_gap=2.0`, `line_separate_threshold=3.0`, `connected_border_tolerance=0.2`) — mirrors `apps/web/.../pyodideConvert.ts` and `workers/convert/engine/convert.py` |
| Live beta | https://resumetoword.pages.dev — HTTP 200; page includes required copy “Formatting may change. Review your resume after conversion.” Browser MCP automation was unavailable this run; conversions were **not** executed in-browser |
| Client pin drift | Browser Pyodide uses PyMuPDF `1.27.2.3` wheel; this harness used worker pin `1.28.2` |
| Editors | Microsoft Word (COM) opened all 10 DOCX; LibreOffice headless exported all 10 DOCX→PDF for visual review |
| Evidence root | `workers/convert/qa/external-spotcheck/` |

**Product wording note:** Results below are internal QA evidence. They are **not** public pass rates. Do not claim perfect layout, 100% accuracy, or ATS guarantees.

## Corpus (10 internet samples)

All files are **open-source / template demo PDFs** (MIT / LPPL / public GitHub template examples). No job-board scrapes. No synthetic PDFs were needed.

Paths:

- PDFs (selected): `workers/convert/qa/external-spotcheck/selected/`
- Raw downloads: `workers/convert/qa/external-spotcheck/pdfs/`
- DOCX: `workers/convert/qa/external-spotcheck/docx/`
- Manifest: `workers/convert/qa/external-spotcheck/manifest.json`
- Machine eval: `workers/convert/qa/external-spotcheck/eval.json`
- Screenshots / compares: `workers/convert/qa/external-spotcheck/screenshots/`

| ID | File | Layout class | Pages | Size | Source |
|---|---|---|---|---|---|
| ext-01 | ext-01-latexcv-classic.pdf | simple | 1 | A4 | jankapunkt/latexcv `classic/main.pdf` |
| ext-02 | ext-02-latexcv-minimalistic.pdf | simple | 6 | Letter | jankapunkt/latexcv `minimalistic/main.pdf` |
| ext-04 | ext-04-ice1000-resume.pdf | simple | 1 | A4 | ice1000/resume `resume.pdf` |
| ext-08 | ext-08-awesome-cv-resume.pdf | simple (icon header) | 3 | A4 | posquit0/Awesome-CV `examples/resume.pdf` |
| ext-05 | ext-05-deedy-two-column.pdf | two_column | 1 | Letter | Deedy-Resume OpenFonts demo |
| ext-06 | ext-06-latexcv-two-column.pdf | two_column | 1 | A4 | jankapunkt/latexcv `two_column/main.pdf` |
| ext-07 | ext-07-latexcv-sidebar.pdf | two_column | 1 | A4 | jankapunkt/latexcv `sidebar/main.pdf` |
| ext-03 | ext-03-latexcv-rows.pdf | complex_graphic | 1 | A4 | jankapunkt/latexcv `rows/main.pdf` |
| ext-09 | ext-09-latexcv-modern.pdf | complex_graphic | 1 | A4 | jankapunkt/latexcv `modern/main.pdf` |
| ext-10 | ext-10-latexcv-infographics.pdf | complex_graphic | 1 | A4 | jankapunkt/latexcv `infographics/main.pdf` |

**Visually rich samples included:** ext-03 (colored bands, photo, vertical labels), ext-06 (photo + QR + dual columns), ext-07 (colored sidebar, icons, photo), ext-09 (photo, banners, QR), ext-10 (charts, timeline, skill bars).

## Conversion outcome

| Metric | Count |
|---|---|
| Converted OK (DOCX produced, native text openable) | **10 / 10** |
| Hard convert failures (exception / empty DOCX) | **0 / 10** |
| Word opens without repair dialog (smoke) | **10 / 10** |
| Image-only DOCX | **0 / 10** |

Bag: convert “success” ≠ visual fidelity pass.

---

## Per-sample findings

PII is not pasted below. Contact checks use yes/no / hit counts only.

### Simple

#### ext-01 — latexcv classic (simple)
- Convert: OK (~39 KB). Native editable text: yes.
- Char completeness (normalized bag): recall ~0.997 / precision ~0.993.
- Critical facts: email/phone/dates/name preserved (automated).
- Reading order: OK on checked headers.
- Visual (PDF vs LO): **Major** — widespread missing spaces (“Currentlyworking…”); bullet lines merge; footer bar/links missing; name pipe collapsed (`KÜSTERRESUME`); 1 PDF page → 2 Word/LO pages.
- Links: none in PDF.
- Editability: Word OK (2 pages).

#### ext-02 — latexcv minimalistic (simple, Letter, 6 pp)
- Convert: OK (~372 KB). Native text: yes.
- Char completeness: recall ~0.915 / precision ~0.998 (some loss).
- Critical facts: email domain/local present in DOCX but often split (icon contact row); phone regex noisy.
- Visual: **Major** — page-1 LO looks nearly empty because content **spills** (LO 7 pages / Word 6); contact icon row incomplete; name spacing collapse.
- Links: PDF had links; DOCX retains hyperlinks.
- Editability: Word OK.

#### ext-04 — ice1000 resume (simple)
- Convert: OK (~41 KB). Native text: yes (python-docx ~3.8k chars).
- Char completeness: recall ~0.907 / precision ~1.0.
- Critical facts: contact line corrupted in visual (`**t t**`); email exists in XML/hyperlinks more than clean paragraph text.
- Visual: **Critical/Major** — first page looks truncated; LO 2 pages with most body on page 2; icon fonts (PUA) break header; horizontal rules lost.
- Links: many PDF URIs; DOCX has hyperlinks but visible labels broken.
- Editability: Word OK (2 pages).

#### ext-08 — Awesome-CV example (simple + icon header)
- Convert: OK (~44 KB). Native text: yes.
- Char completeness: recall ~0.993 / precision ~1.0.
- Critical facts: contact icon row jumbled (`ailto:`, overlapping fragments); dates mostly OK.
- Visual: **Major** — missing spaces across body; right-aligned dates wrap badly; icon/contact cluster unreadable; 3→4 (LO) / 5 (Word) pages.
- Links: present but labels degraded.
- Editability: Word OK.

### Two-column / sidebar

#### ext-05 — Deedy two-column (two_column, Letter)
- Convert: OK (~40 KB). Native text: yes.
- Char completeness: recall ~0.936 / precision ~1.0.
- Critical facts: contact line largely missing from readable paragraph text (mailto may remain in hyperlink fields).
- Visual: **Critical** — columns broken / interleaved (“INTERN” into Education); overlap at bottom; font substitution; rules lost; 1→2 pages.
- Reading order: automated header order OK; **human visual shows interleave**.
- Editability: Word OK (2 pages).

#### ext-06 — latexcv two-column (two_column + photo/QR)
- Convert: OK (~443 KB). Native text extractable: yes.
- Char completeness: recall ~0.999 / precision ~0.997.
- Visual: **Critical** — page-1 LO nearly empty (text spilled; LO **7** pages vs Word **2**); photo/QR overlap; section bar labels missing on p1; footer missing.
- Floating drawings/anchors present in DOCX (`wp:anchor`/`wp:inline`).
- Editability: Word OK but layout not usable as a resume page.

#### ext-07 — latexcv sidebar (two_column)
- Convert: OK (~751 KB). Native text: yes.
- Char completeness: recall ~0.972 / precision ~0.999.
- Critical facts: mostly present; icon glyphs → mojibake (`½Bremen`, `Æ+49`).
- Visual: **Critical/Major** — header name band missing; missing spaces; photo clip; icons/QR missing or wrong; sidebar tools line garbled; footer missing; suspect reading-order issues.
- Editability: Word OK (2 pages).

### Complex graphic

#### ext-03 — latexcv rows (complex_graphic)
- Convert: OK (~747 KB). Native text extractable: yes.
- Char completeness: recall ~0.991 / precision ~0.999.
- Visual: **Critical** — LO p1 shows graphics/bullets with almost no body text (spill to p2); vertical “EXPERIENCE/EDUCATION” labels gone; photo stretched; quote band text missing; footer text missing.
- Drawings heavy in PDF (74). Many decorative images in DOCX (16).
- Editability: Word reports 1 page / ~2570 chars — better than LO visual, still not layout-faithful.

#### ext-09 — latexcv modern (complex_graphic)
- Convert: OK (~747 KB). Native text: yes.
- Char completeness: recall ~0.999 / precision ~0.997.
- Visual: **Critical** — header banner/name failure; photo massively oversized overlapping text; missing spaces in “Loves”; education indentation collapse; footer missing. Stays 1 page but unreadable top.
- Editability: Word OK (1 page).

#### ext-10 — latexcv infographics (complex_graphic)
- Convert: OK (~145 KB). Native text: yes.
- Char completeness: recall ~0.997 / precision ~0.993.
- Visual: **Critical** — timeline labels detached/overlapping; donut labels boxed over chart; missing spaces; contact cluster unreadable; activities overlap “7 years” badge. Stays 1 page, largely unusable visually.
- Reading order: suspect interleave (automated).
- Editability: Word OK (1 page).

---

## Bug list (severity)

### Critical
1. **Two-column / sidebar layouts break into interleave, overlap, or unusable pages** — ext-05, ext-06, ext-07.  
2. **Complex graphic resumes lose visual usability** (charts/timeline/photo/banners) — ext-03, ext-09, ext-10.  
3. **Page-1 “empty” / content spill** after convert (absolute/floating layout) — especially ext-02, ext-03, ext-04, ext-06 (LO page inflation up to 7). Word often better than LO but still expands pages.

### Major
4. **Missing spaces / concatenated words** across simple and rich samples — ext-01, ext-07, ext-08, ext-09, ext-10.  
5. **Icon-font / contact-row corruption** (PUA glyphs, broken `mailto:` visible text) — ext-04, ext-07, ext-08.  
6. **Decorative header/footer bars and rules dropped or emptied** — ext-01, ext-03, ext-06, ext-07, ext-09.  
7. **Images misplaced or wildly scaled** (photo/QR) — ext-06, ext-07, ext-09.  
8. **Right-aligned dates/locations wrap or detach** — ext-05, ext-08.

### Minor
9. Font substitution / weight loss (expected under font policy).  
10. Bullet merge / inconsistent indentation on otherwise readable simples — ext-01.  
11. Hyperlink **targets** often retained while **visible labels** degrade.

---

## Summary by layout class (counts only — no blended %)

| Layout class | N | Convert OK | Native editable text | Visually usable in editor (human) | Notable |
|---|---|---|---|---|---|
| simple | 4 | 4/4 | 4/4 | 0–1/4 usable without heavy cleanup (ext-01 closest; still space bugs) | Space loss + contact icons + page spill |
| two_column | 3 | 3/3 | 3/3 | 0/3 | Column interleave / empty p1 / sidebar collapse |
| complex_graphic | 3 | 3/3 | 3/3 | 0/3 | Charts, timelines, photos, bands fail visually |

**Interpretation for product:** Text is usually recoverable as native DOCX characters, but **layout fidelity on internet template resumes is not launch-grade** for two-column or graphic designs. Keep the required warning; narrow public support messaging toward simple text PDFs (align with US-101).

---

## Recommendations

1. **Support boundary (copy):** Explicitly warn that multi-column, sidebar, icon-font, and infographic resumes will change — often badly. Do not imply visual parity.  
2. **File bugs / eng follow-ups:**  
   - Missing-space / word-concat regression (affects even “simple”).  
   - Column reconstruction quality (Deedy / sidebar).  
   - Floating image scale/position (modern / two-column).  
   - Icon-font / contact-row handling.  
3. **Editor matrix:** LibreOffice visuals are harsher than Word for these DOCX (e.g. ext-06 LO 7 pages vs Word 2). Report editor-specific notes; don’t rely on LO-only screenshots.  
4. **Beta (US-100):** Prefer recruiting users with **simple single-column text PDFs**; treat rich templates as expected-failure / warning validation, not success samples.  
5. **Harness:** Keep `run_spotcheck.py` for re-runs; optional future: browser Pyodide path on live beta once browser automation is available (pin drift vs `1.28.2`).

## Blockers encountered

- Browser MCP could not open tabs this session → no end-to-end convert on https://resumetoword.pages.dev (site itself responds 200 with fidelity warning).  
- Some third-party URLs 404’d; corpus filled from latexcv / Awesome-CV / Deedy / ice1000 (rights-safe template demos).  
- No rights blocker for the chosen set.

## Artifacts checklist

- [x] 10 PDFs in `selected/` + extras in `pdfs/`  
- [x] 10 DOCX in `docx/`  
- [x] `manifest.json`  
- [x] `eval.json`  
- [x] Side-by-side screenshots in `screenshots/*-compare.png`  
- [x] This `RESULTS.md`  
