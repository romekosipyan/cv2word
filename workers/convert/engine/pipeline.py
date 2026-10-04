"""Inspect → convert → output validation (US-010 / US-011).

No silent OCR. No silent content-dropping fallback. Mixed/image-only pages
that would omit meaningful content fail with scan_detected before convert.
Empty, omitted-page, macro, or unsafe packages fail with output_invalid.
"""

from __future__ import annotations

from pathlib import Path

from engine import ENGINE_VERSION
from engine.convert import convert_pdf_to_docx
from engine.inspect_gates import inspect_path
from engine.validate import DEFAULT_FILENAME, validate_output

# Validation-class errors: never retry as infrastructure.
VALIDATION_ERRORS = frozenset(
    {
        "unsupported_type",
        "too_large",
        "too_many_pages",
        "encrypted",
        "corrupt",
        "scan_detected",
        "output_invalid",
    }
)


def _fail(error: str, **extra: object) -> dict:
    kind = "validation" if error in VALIDATION_ERRORS else "infra"
    out: dict = {
        "ok": False,
        "error": error,
        "kind": kind,
        "engine_version": ENGINE_VERSION,
    }
    out.update(extra)
    return out


def run_pipeline(pdf_path: Path, docx_path: Path, *, size_bytes: int | None = None) -> dict:
    """Run inspect + pdf2docx + US-011 validation. Never includes resume text."""
    inspected = inspect_path(pdf_path, size_bytes=size_bytes)
    # Strip any accidental text-like keys from inspect (defense).
    for banned in ("text", "content", "page_text", "extract", "chars_sample"):
        inspected.pop(banned, None)

    if not inspected.get("ok"):
        error = str(inspected.get("error") or "corrupt")
        return _fail(
            error,
            page_count=inspected.get("page_count", 0),
            size_bytes=inspected.get("size_bytes"),
        )

    warnings = list(inspected.get("warnings") or [])
    page_count = int(inspected.get("page_count") or 0)

    try:
        convert_pdf_to_docx(pdf_path, docx_path)
    except Exception:  # noqa: BLE001 — never leak exception text (may cite paths/content)
        return _fail(
            "conversion_failed",
            page_count=page_count,
            size_bytes=inspected.get("size_bytes"),
        )

    check = validate_output(
        docx_path,
        expected_page_count=page_count,
        pdf_path=pdf_path,
    )
    if not check.get("ok"):
        # Remove incomplete/unsafe output so a redelivery cannot serve a bad file.
        try:
            if docx_path.is_file():
                docx_path.unlink()
        except OSError:
            pass
        return _fail(
            "output_invalid",
            page_count=page_count,
            size_bytes=inspected.get("size_bytes"),
            reason=check.get("reason"),
            native_chars=check.get("native_chars", 0),
            image_count=check.get("image_count", 0),
        )

    for code in check.get("warnings") or []:
        if code not in warnings:
            warnings.append(code)

    return {
        "ok": True,
        "engine_version": ENGINE_VERSION,
        "page_count": page_count,
        "size_bytes": inspected.get("size_bytes"),
        "warnings": warnings,
        "filename": DEFAULT_FILENAME,
        # Counts only — never the text itself.
        "native_chars": check.get("native_chars", 0),
        "image_count": check.get("image_count", 0),
        "docx_pages": check.get("docx_pages"),
    }
