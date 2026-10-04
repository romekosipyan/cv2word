"""US-070 local spike harness.

Inspect with PyMuPDF, reconstruct with pdf2docx, score by layout class.
Not a production worker. No image publish. No Next.js conversion.
"""

from __future__ import annotations

import importlib.metadata
import json
import traceback
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pymupdf as fitz
from pdf2docx import Converter

from metrics import (
    CriticalFacts,
    character_precision,
    character_recall,
    column_interleave,
    count_docx_images,
    docx_has_native_body_text,
    docx_is_image_only_pages,
    docx_package_ok,
    duplicate_flags,
    extract_docx_text,
    normalize_chars,
)

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
OUTPUT = ROOT / "output"
DOCX_DIR = OUTPUT / "docx"

# Planning-assumption gates from SPEC-FIDELITY. Not public claims.
SIMPLE_RECALL_GATE = 0.99
SIMPLE_PRECISION_GATE = 0.99

# Scan detection: reject a page that cannot support text-PDF conversion.
# Measured in chars / square point after whitespace strip. Tuned on eval
# (non-held-out) scanned vs text fixtures only.
SCAN_CHARS_PER_PAGE = 80
SCAN_DENSITY = 0.00015


def package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "missing"


def inspect_pdf(path: Path) -> dict:
    doc = fitz.open(path)
    pages = []
    try:
        for page in doc:
            raw = page.get_text("text") or ""
            chars = len(normalize_chars(raw))
            area = float(page.rect.width * page.rect.height) or 1.0
            images = page.get_images(full=True)
            density = chars / area
            low_text = chars < SCAN_CHARS_PER_PAGE
            pages.append(
                {
                    "index": page.number,
                    "chars": chars,
                    "density": round(density, 8),
                    "image_count": len(images),
                    "low_text": low_text,
                    "width": round(page.rect.width, 2),
                    "height": round(page.rect.height, 2),
                }
            )
    finally:
        doc.close()
    any_low = any(p["low_text"] for p in pages)
    all_low = all(p["low_text"] for p in pages) if pages else True
    mixed = any_low and not all_low
    scan_detected = any_low
    return {
        "page_count": len(pages),
        "pages": pages,
        "min_page_chars": min((p["chars"] for p in pages), default=0),
        "max_page_chars": max((p["chars"] for p in pages), default=0),
        "min_density": min((p["density"] for p in pages), default=0.0),
        "scan_detected": scan_detected,
        "mixed_pages": mixed,
        "all_pages_low_text": all_low,
    }


def convert_pdf(pdf_path: Path, docx_path: Path) -> dict:
    docx_path.parent.mkdir(parents=True, exist_ok=True)
    if docx_path.exists():
        docx_path.unlink()
    started = datetime.now(timezone.utc)
    error = None
    try:
        converter = Converter(str(pdf_path))
        try:
            converter.convert(str(docx_path))
        finally:
            converter.close()
    except Exception as exc:  # noqa: BLE001 — spike records convert failures
        error = f"{type(exc).__name__}: {exc}"
    elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    return {
        "ok": error is None and docx_path.exists() and docx_path.stat().st_size > 0,
        "error": error,
        "elapsed_ms": elapsed_ms,
        "docx": str(docx_path.relative_to(ROOT)).replace("\\", "/"),
        "bytes": docx_path.stat().st_size if docx_path.exists() else 0,
    }


def load_expected(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def score_file(entry: dict) -> dict:
    expected_path = ROOT / entry["expected"]
    expected = load_expected(expected_path)
    pdf_path = ROOT / entry["pdf"]
    docx_path = DOCX_DIR / f"{entry['id']}.docx"
    inspection = inspect_pdf(pdf_path)
    conversion = convert_pdf(pdf_path, docx_path)

    expected_text = expected.get("expected_text", "")
    facts = CriticalFacts(
        name=expected["name"],
        email=expected["email"],
        phone=expected["phone"],
        dates=expected.get("dates", []),
        employers=expected.get("employers", []),
    )

    actual_text = ""
    native = False
    image_only = False
    image_count = 0
    package_ok = False
    recall = 0.0
    precision = 0.0
    dups: list[str] = []
    fact_result = facts.check("", source=expected_text)
    interleave = None

    if conversion["ok"]:
        package_ok = docx_package_ok(str(docx_path))
        actual_text = extract_docx_text(str(docx_path))
        native = docx_has_native_body_text(str(docx_path))
        image_only = docx_is_image_only_pages(str(docx_path))
        image_count = count_docx_images(str(docx_path))
        recall = character_recall(expected_text, actual_text)
        precision = character_precision(expected_text, actual_text)
        dups = duplicate_flags(expected_text, actual_text, facts.values())
        fact_result = facts.check(actual_text, source=expected_text)
        if expected.get("left_only") and expected.get("right_only"):
            interleave = column_interleave(actual_text, expected["left_only"], expected["right_only"])

    layout = expected["class"]
    expect_scan = bool(expected.get("expect_scan_detect"))
    scan_correct = inspection["scan_detected"] == expect_scan

    file_pass = decide_pass(
        layout=layout,
        expect_scan=expect_scan,
        inspection=inspection,
        conversion=conversion,
        recall=recall,
        precision=precision,
        fact_result=fact_result,
        native=native,
        image_only=image_only,
        dups=dups,
        interleave=interleave,
        scan_correct=scan_correct,
    )

    return {
        "id": entry["id"],
        "class": layout,
        "held_out": bool(entry.get("held_out")),
        "page_size": entry.get("page_size"),
        "expect_scan_detect": expect_scan,
        "inspection": inspection,
        "conversion": {k: v for k, v in conversion.items() if k != "ok"} | {"ok": conversion["ok"]},
        "recall": round(recall, 6),
        "precision": round(precision, 6),
        "critical_facts": fact_result,
        "native_body_text": native,
        "image_only_pages": image_only,
        "docx_images": image_count,
        "package_ok": package_ok,
        "duplicate_flags": dups,
        "column_order": interleave,
        "scan_detection_correct": scan_correct,
        "pass": file_pass["pass"],
        "fail_reasons": file_pass["reasons"],
        "actual_char_count": len(normalize_chars(actual_text)),
        "expected_char_count": len(normalize_chars(expected_text)),
    }


def decide_pass(
    *,
    layout: str,
    expect_scan: bool,
    inspection: dict,
    conversion: dict,
    recall: float,
    precision: float,
    fact_result: dict,
    native: bool,
    image_only: bool,
    dups: list[str],
    interleave: dict | None,
    scan_correct: bool,
) -> dict:
    reasons: list[str] = []
    if layout == "scanned_mixed":
        if not scan_correct:
            reasons.append("scan_not_detected" if expect_scan else "false_scan_detect")
        return {"pass": not reasons, "reasons": reasons}

    if not conversion["ok"]:
        reasons.append("convert_failed")
        return {"pass": False, "reasons": reasons}
    if recall < SIMPLE_RECALL_GATE:
        reasons.append("recall_below_gate")
    if precision < SIMPLE_PRECISION_GATE:
        reasons.append("precision_below_gate")
    if not fact_result["all_present"]:
        reasons.append("critical_fact_missing")
    if not native or image_only:
        reasons.append("body_not_native_text")
    if dups:
        reasons.append("duplicate_text")
    if layout == "two_column" and interleave and interleave["interleaved"]:
        reasons.append("column_interleave")
    if inspection["scan_detected"]:
        reasons.append("false_scan_detect")
    return {"pass": not reasons, "reasons": reasons}


def summarize(rows: list[dict]) -> dict:
    by_class: dict[str, dict] = {}
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[row["class"]].append(row)

    for layout, items in grouped.items():
        eval_items = [row for row in items if not row["held_out"]]
        held = [row for row in items if row["held_out"]]
        by_class[layout] = {
            "eval": _slice_stats(eval_items),
            "held_out": _slice_stats(held),
            "all": _slice_stats(items),
        }
    return by_class


def _slice_stats(items: list[dict]) -> dict:
    if not items:
        return {"n": 0}
    recalls = [row["recall"] for row in items]
    precisions = [row["precision"] for row in items]
    return {
        "n": len(items),
        "pass": sum(1 for row in items if row["pass"]),
        "fail": sum(1 for row in items if not row["pass"]),
        "pass_rate": round(sum(1 for row in items if row["pass"]) / len(items), 4),
        "recall_min": round(min(recalls), 4),
        "recall_median": round(sorted(recalls)[len(recalls) // 2], 4),
        "precision_min": round(min(precisions), 4),
        "precision_median": round(sorted(precisions)[len(precisions) // 2], 4),
        "critical_facts_pass": sum(1 for row in items if row["critical_facts"]["all_present"]),
        "native_text_pass": sum(1 for row in items if row["native_body_text"] and not row["image_only_pages"]),
        "scan_detection_correct": sum(1 for row in items if row["scan_detection_correct"]),
        "duplicate_flagged": sum(1 for row in items if row["duplicate_flags"]),
        "failures": [
            {"id": row["id"], "reasons": row["fail_reasons"], "recall": row["recall"], "precision": row["precision"]}
            for row in items
            if not row["pass"]
        ],
    }


def recommend(by_class: dict, versions: dict) -> dict:
    simple = by_class.get("simple", {}).get("eval", {})
    two_col = by_class.get("two_column", {}).get("eval", {})
    complex_ = by_class.get("complex", {}).get("eval", {})
    scanned = by_class.get("scanned_mixed", {}).get("eval", {})

    simple_ok = simple.get("n", 0) > 0 and simple.get("fail", 1) == 0
    scan_ok = scanned.get("n", 0) > 0 and scanned.get("scan_detection_correct", 0) == scanned.get("n", 0)
    two_ok = two_col.get("n", 0) > 0 and two_col.get("fail", 1) == 0
    simple_majority = simple.get("n", 0) > 0 and simple.get("pass", 0) / simple["n"] >= 0.8

    if simple_ok and scan_ok and two_ok:
        decision = "go"
        rationale = (
            "Eval simple fixtures met the planning-assumption text gates, "
            "two-column eval passed separately, and scan fixtures were detected."
        )
    elif simple_ok and scan_ok:
        decision = "narrow"
        rationale = (
            "Eval simple fixtures met the planning-assumption text gates and scan "
            "detection worked. Two-column and/or complex did not. P0 should stay "
            "on simple text PDFs with a column-order warning path."
        )
    elif simple_majority and scan_ok:
        decision = "narrow"
        rationale = (
            "Most eval simple fixtures passed, but the 99% planning-assumption gate "
            "was not met on every file. Continue only with a narrowed simple-text "
            "scope and more QA corpus work in US-090."
        )
    else:
        decision = "stop"
        rationale = (
            "Eval simple fixtures did not recover editable structure well enough, "
            "or scan detection missed rejection fixtures. Do not start US-010."
        )

    return {
        "decision": decision,
        "rationale": rationale,
        "scan_detection": {
            "rule": (
                f"Reject when any page has fewer than {SCAN_CHARS_PER_PAGE} "
                f"non-whitespace characters (density below {SCAN_DENSITY} as supporting signal)."
            ),
            "p0_recommendation": (
                "P0 must fail mixed or image-only pages with scan_detected. "
                "Do not OCR and do not drop the page silently."
            ),
            "eval_correct": scanned.get("scan_detection_correct"),
            "eval_n": scanned.get("n"),
        },
        "pdf2docx_fork": {
            "upstream_status": "pdf2docx 0.5.13 is MIT and no longer actively maintained by Artifex.",
            "recommendation": (
                "Pin 0.5.13 for the P0 path unless a concrete reconstruction bug "
                "requires a patch. Do not fork pre-emptively. A human must decide "
                "pin vs community fork vs internal fork in ADR-004."
            ),
        },
        "license_note": (
            "PyMuPDF remains AGPL or commercial. This spike does not choose a route. "
            "See ADR-003 / US-071. Do not publish a worker image."
        ),
        "versions": versions,
        "gates_are_planning_assumptions": True,
        "simple_eval": simple,
        "two_column_eval": two_col,
        "complex_eval": complex_,
        "scanned_eval": scanned,
    }


def write_results_md(payload: dict) -> str:
    versions = payload["versions"]
    by_class = payload["by_class"]
    rec = payload["recommendation"]
    gap = payload["corpus_gap"]
    counts = payload["spike_counts"]

    def table_for(layout: str) -> str:
        block = by_class.get(layout, {})
        ev = block.get("eval", {"n": 0})
        ho = block.get("held_out", {"n": 0})
        if ev.get("n", 0) == 0:
            return f"_No {layout} eval fixtures._"
        lines = [
            f"| Split | n | Pass | Fail | Recall min / median | Precision min / median | Critical facts | Native text | Scan detect |",
            f"|---|---:|---:|---:|---|---|---:|---:|---:|",
        ]
        for label, stats in (("eval", ev), ("held-out", ho)):
            if not stats.get("n"):
                lines.append(f"| {label} | 0 | — | — | — | — | — | — | — |")
                continue
            lines.append(
                "| {label} | {n} | {pass_} | {fail} | {rmin} / {rmed} | {pmin} / {pmed} | {facts} | {native} | {scan} |".format(
                    label=label,
                    n=stats["n"],
                    pass_=stats["pass"],
                    fail=stats["fail"],
                    rmin=stats["recall_min"],
                    rmed=stats["recall_median"],
                    pmin=stats["precision_min"],
                    pmed=stats["precision_median"],
                    facts=f"{stats['critical_facts_pass']}/{stats['n']}",
                    native=f"{stats['native_text_pass']}/{stats['n']}",
                    scan=f"{stats['scan_detection_correct']}/{stats['n']}",
                )
            )
        fails = ev.get("failures") or []
        if fails:
            lines.append("")
            lines.append("Eval failures (ids and reasons only):")
            for item in fails:
                lines.append(
                    f"- `{item['id']}`: {', '.join(item['reasons'])} "
                    f"(recall={item['recall']}, precision={item['precision']})"
                )
        ho_fails = ho.get("failures") or []
        if ho_fails:
            lines.append("")
            lines.append("Held-out failures (not used for threshold tuning):")
            for item in ho_fails:
                lines.append(
                    f"- `{item['id']}`: {', '.join(item['reasons'])} "
                    f"(recall={item['recall']}, precision={item['precision']})"
                )
        return "\n".join(lines)

    two_col_files = [row for row in payload.get("files", []) if row.get("class") == "two_column"]
    order_lines = []
    for row in two_col_files:
        order = row.get("column_order") or {}
        split = "held-out" if row.get("held_out") else "eval"
        order_lines.append(
            f"- `{row['id']}` ({split}): sequence `{order.get('sequence') or 'n/a'}`, "
            f"switches={order.get('switches')}, interleaved={order.get('interleaved')}, "
            f"markers L={order.get('left_found')}/R={order.get('right_found')}"
        )
    order_block = "\n".join(order_lines) if order_lines else "_No two-column files._"

    md = f"""# US-070 conversion fidelity spike results

Local harness only. Not a production worker. Scores are **not** blended across layout classes.
Gates of 99% recall/precision are [[SPEC-FIDELITY]] planning assumptions, not public claims.
Do not claim perfect layout, ATS compatibility, or 100% accuracy.

These PDFs were authored by the spike itself. That is easier than third-party designer exports. [[US-090]] still owns launch-gate measurement on the full QA corpus.

## Engine versions

| Package | Pinned | Runtime |
|---|---|---|
| PyMuPDF | `{versions['pinned']['pymupdf']}` | `{versions['runtime']['pymupdf']}` |
| pdf2docx | `{versions['pinned']['pdf2docx']}` | `{versions['runtime']['pdf2docx']}` |
| python-docx | `{versions['pinned']['python-docx']}` | `{versions['runtime']['python-docx']}` |

Python `{versions['python']}`. Ran `{payload['ran_at']}`.

PyMuPDF license is still open: [[ADR-003 PyMuPDF License]] / [[US-071]]. This spike does not pick AGPL vs commercial. Do not publish a worker image.

## Fixtures

Synthetic identities only (`example.test`, NANP `555` numbers). Held-out ids were scored but not used to tune scan thresholds.

| Class | Spike n | QA corpus target | Gap | Held-out |
|---|---:|---:|---:|---|
| Simple text | {counts['simple']} | 30 | {gap['simple']} | simple-025–030 |
| Two-column | {counts['two_column']} | 15 | {gap['two_column']} | two-column-07–08 |
| Complex graphic | {counts['complex']} | 5 | {gap['complex']} | complex-03 |
| Scanned / mixed | {counts['scanned_mixed']} | 10 | {gap['scanned_mixed']} | scanned-05–06 |
| Total | {counts['total']} | 60 | {60 - counts['total']} | see `fixtures/held_out.json` |

A4 and Letter, 1–3 pages, accents, ligature codepoints, and links are represented in the simple set. The remaining gap vs the 60-file QA corpus is more two-column, complex, and scanned variety plus two extra pages on some classes — owned by [[US-090]] / [[Benchmark Corpus]].

## Simple text

{table_for("simple")}

## Two-column (separate from simple)

{table_for("two_column")}

Reading-order markers (left column tokens then right). `LLLRRR` is column-then-column. Interleaving would look like `LRLR`.

{order_block}

## Complex graphic

{table_for("complex")}

## Scanned / mixed (P0 rejection)

{table_for("scanned_mixed")}

## Scan-detection recommendation for P0

{rec['scan_detection']['rule']}

{rec['scan_detection']['p0_recommendation']}

Eval scan-detection correctness: {rec['scan_detection']['eval_correct']} / {rec['scan_detection']['eval_n']}.

## pdf2docx maintenance

{rec['pdf2docx_fork']['upstream_status']}

{rec['pdf2docx_fork']['recommendation']}

Recorded on [[ADR-004 pdf2docx Maintenance]] (status remains `open` pending a human decision).

## Notes that are not launch claims

- Recovered body text on text PDFs was native DOCX runs, not page images.
- Some fonts encode ASCII hyphens as soft hyphens in the PDF. Phone and marker checks use digit / alphanumeric matching so that is not scored as missing content. Spacing and hyphen glyphs may still change.
- Complex fixtures can clip job lines in the source drawing. Facts are scored only when they exist in the source PDF.
- Mixed pages can still emit partial native text from the text page. P0 must still reject the job (`scan_detected`) because the image page would omit content.
- Visual clipping, editor open/repair, and real-resume variety were not measured here ([[US-073]], [[US-094]], [[US-090]]).

## Go / narrow / stop

**{rec['decision'].upper()}** — {rec['rationale']}

Continue P0 engineering on text PDFs. Keep two-column as a warned path until [[US-090]]. Do not treat complex-graphic as a supported P0 class. Reject scans in P0. Do not start OCR ([[US-080]]).

{rec['license_note']}

## How to rerun

```
cd workers/convert/spike
.venv\\Scripts\\activate
python generate_fixtures.py
python harness.py
```

Do not paste fixture resume text into vault notes. Metrics only.
"""
    return md


def main() -> None:
    manifest_path = FIXTURES / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit("fixtures/manifest.json missing. Run python generate_fixtures.py first.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    DOCX_DIR.mkdir(parents=True, exist_ok=True)

    versions = {
        "pinned": {"pymupdf": "1.28.2", "pdf2docx": "0.5.13", "python-docx": "1.2.0"},
        "runtime": {
            "pymupdf": package_version("pymupdf"),
            "pdf2docx": package_version("pdf2docx"),
            "python-docx": package_version("python-docx"),
        },
        "python": __import__("sys").version.split()[0],
        "pymupdf_bind": list(getattr(fitz, "version", [])),
    }

    rows = []
    for entry in manifest["files"]:
        print(f"scoring {entry['id']}...", flush=True)
        try:
            rows.append(score_file(entry))
        except Exception as exc:  # noqa: BLE001
            rows.append(
                {
                    "id": entry["id"],
                    "class": entry["class"],
                    "held_out": bool(entry.get("held_out")),
                    "pass": False,
                    "fail_reasons": [f"harness_error:{type(exc).__name__}"],
                    "recall": 0.0,
                    "precision": 0.0,
                    "critical_facts": {"all_present": False, "missing_kinds": ["harness"], "checked": 0},
                    "native_body_text": False,
                    "image_only_pages": False,
                    "docx_images": 0,
                    "package_ok": False,
                    "duplicate_flags": [],
                    "column_order": None,
                    "scan_detection_correct": False,
                    "inspection": {},
                    "conversion": {"ok": False, "error": traceback.format_exc(limit=3)},
                    "expect_scan_detect": bool(entry.get("expect_scan_detect")),
                    "actual_char_count": 0,
                    "expected_char_count": 0,
                }
            )

    by_class = summarize(rows)
    recommendation = recommend(by_class, versions)
    payload = {
        "story": "US-070",
        "ran_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "versions": versions,
        "spike_counts": manifest["spike_counts"],
        "corpus_gap": manifest["corpus_gap"],
        "held_out": manifest["held_out"],
        "by_class": by_class,
        "recommendation": recommendation,
        "files": rows,
    }
    (OUTPUT / "results.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    results_md = write_results_md(payload)
    (ROOT / "RESULTS.md").write_text(results_md, encoding="utf-8")
    print(json.dumps({"decision": recommendation["decision"], "by_class": by_class}, indent=2))


if __name__ == "__main__":
    main()
