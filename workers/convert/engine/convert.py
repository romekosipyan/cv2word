"""pdf2docx reconstruction. No OCR. Never fetch URLs found inside PDFs."""

from __future__ import annotations

import logging
from pathlib import Path

from pdf2docx import Converter

# pdf2docx logs page progress to stderr; keep worker stdout JSON-only and
# avoid path/content chatter in operational logs.
logging.getLogger("pdf2docx").setLevel(logging.WARNING)
logging.getLogger("pdf2docx.main").setLevel(logging.WARNING)


def convert_pdf_to_docx(pdf_path: Path, docx_path: Path) -> None:
    """Write a DOCX with native editable body text for a text PDF.

    Raises on conversion failure. Caller must have already passed inspect gates
    (including scan_detected). Does not install OCR fallbacks.
    """
    docx_path.parent.mkdir(parents=True, exist_ok=True)
    if docx_path.exists():
        docx_path.unlink()
    converter = Converter(str(pdf_path))
    try:
        converter.convert(str(docx_path))
    finally:
        converter.close()
    if not docx_path.is_file() or docx_path.stat().st_size <= 0:
        raise RuntimeError("docx_missing_or_empty")
