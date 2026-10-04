#!/usr/bin/env python3
"""PDF inspection gates for complete-upload (US-002).

Reads a local PDF path, prints one JSON object to stdout.
Never prints extracted resume text. No OCR. No pdf2docx conversion.

Exit codes:
  0 — JSON written (ok true or false)
  2 — usage / IO error outside PDF parse
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pymupdf as fitz

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PAGES = 5
MIN_PAGES = 1
# US-070: reject when any page has fewer than 80 non-whitespace chars.
SCAN_CHARS_PER_PAGE = 80
# Supporting signal from US-070 spike (chars/area); not used as a sole reject gate.
SCAN_DENSITY = 0.00015  # noqa: F841 — documented parity with spike harness
# SPEC-WORKER raster cap (points ≈ pixels at 72 DPI).
MAX_PAGE_MEGAPIXELS = 20.0
# Common page sizes with tolerance (points).
A4_W, A4_H = 595.28, 841.89
LETTER_W, LETTER_H = 612.0, 792.0
PAGE_SIZE_TOL = 8.0


def normalize_chars(text: str) -> str:
    return "".join(ch for ch in text if not ch.isspace())


def _is_portfolio(doc: fitz.Document) -> bool:
    """Reject PDF collections / portfolios (embedded-file packages)."""
    try:
        if doc.embfile_count() > 0 and doc.page_count == 0:
            return True
    except Exception:  # noqa: BLE001 — treat probe failures as non-portfolio
        pass
    try:
        catalog = doc.pdf_catalog()
        # xref of /Collection on the catalog dictionary indicates a portfolio.
        if catalog and doc.xref_get_key(catalog, "Collection")[0] != "null":
            return True
    except Exception:  # noqa: BLE001
        pass
    return False


def _page_megapixels(page: fitz.Page) -> float:
    # 1 PDF point = 1 device pixel at 72 DPI; matches worker raster budget units.
    area = float(page.rect.width * page.rect.height)
    return area / 1_000_000.0


def _within_common_page_size(width: float, height: float) -> bool:
    dims = sorted((width, height))
    for target in (
        sorted((A4_W, A4_H)),
        sorted((LETTER_W, LETTER_H)),
    ):
        if (
            abs(dims[0] - target[0]) <= PAGE_SIZE_TOL
            and abs(dims[1] - target[1]) <= PAGE_SIZE_TOL
        ):
            return True
    # Non-A4/Letter pages are still accepted when under raster/geometry caps.
    return True


def inspect_path(path: Path, size_bytes: int | None = None) -> dict:
    """Return a JSON-serializable inspect result. Never includes page text."""
    if not path.is_file():
        return {"ok": False, "error": "corrupt", "page_count": 0}

    nbytes = size_bytes if size_bytes is not None else path.stat().st_size
    if nbytes > MAX_UPLOAD_BYTES:
        return {
            "ok": False,
            "error": "too_large",
            "page_count": 0,
            "size_bytes": nbytes,
            "limit_bytes": MAX_UPLOAD_BYTES,
        }

    # Signature gate — MIME/extension alone must never accept.
    head = path.read_bytes()[:8]
    if not head.startswith(b"%PDF"):
        return {
            "ok": False,
            "error": "unsupported_type",
            "page_count": 0,
            "size_bytes": nbytes,
        }

    try:
        doc = fitz.open(path)
    except Exception:  # noqa: BLE001 — any open failure is corrupt for clients
        return {
            "ok": False,
            "error": "corrupt",
            "page_count": 0,
            "size_bytes": nbytes,
        }

    try:
        if doc.is_encrypted or doc.needs_pass:
            return {
                "ok": False,
                "error": "encrypted",
                "page_count": 0,
                "size_bytes": nbytes,
            }

        if _is_portfolio(doc):
            return {
                "ok": False,
                "error": "unsupported_type",
                "page_count": int(doc.page_count),
                "size_bytes": nbytes,
            }

        page_count = int(doc.page_count)
        if page_count < MIN_PAGES:
            return {
                "ok": False,
                "error": "corrupt",
                "page_count": page_count,
                "size_bytes": nbytes,
                "limit_pages": MAX_PAGES,
            }
        if page_count > MAX_PAGES:
            return {
                "ok": False,
                "error": "too_many_pages",
                "page_count": page_count,
                "size_bytes": nbytes,
                "limit_pages": MAX_PAGES,
            }

        scan_detected = False
        max_megapixels = 0.0
        for page in doc:
            raw = page.get_text("text") or ""
            chars = len(normalize_chars(raw))
            # US-070 / spike harness: reject when any page has fewer than
            # SCAN_CHARS_PER_PAGE non-whitespace characters. Density below
            # SCAN_DENSITY is a supporting signal only (not a sole reject gate).
            if chars < SCAN_CHARS_PER_PAGE:
                scan_detected = True

            mp = _page_megapixels(page)
            if mp > max_megapixels:
                max_megapixels = mp
            if mp > MAX_PAGE_MEGAPIXELS:
                return {
                    "ok": False,
                    "error": "unsupported_type",
                    "page_count": page_count,
                    "size_bytes": nbytes,
                    "max_page_megapixels": round(mp, 4),
                    "limit_megapixels": MAX_PAGE_MEGAPIXELS,
                }
            # A4 / Letter are explicitly in-contract; other sizes OK under caps.
            _within_common_page_size(page.rect.width, page.rect.height)

        if scan_detected:
            return {
                "ok": False,
                "error": "scan_detected",
                "page_count": page_count,
                "size_bytes": nbytes,
            }

        return {
            "ok": True,
            "page_count": page_count,
            "size_bytes": nbytes,
            "max_page_megapixels": round(max_megapixels, 4),
            "warnings": [],
        }
    except Exception:  # noqa: BLE001
        return {
            "ok": False,
            "error": "corrupt",
            "page_count": 0,
            "size_bytes": nbytes,
        }
    finally:
        doc.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ResumeToWord PDF inspect (US-002)")
    parser.add_argument("path", type=Path, help="Absolute path to uploaded object")
    parser.add_argument(
        "--size-bytes",
        type=int,
        default=None,
        help="Optional size override (from object store metadata)",
    )
    args = parser.parse_args(argv)

    try:
        result = inspect_path(args.path, size_bytes=args.size_bytes)
    except OSError:
        print(json.dumps({"ok": False, "error": "corrupt", "page_count": 0}))
        return 2

    # Hard guarantee: never emit text-like fields from the document.
    banned = {"text", "content", "page_text", "extract", "chars_sample"}
    for key in banned:
        result.pop(key, None)

    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
