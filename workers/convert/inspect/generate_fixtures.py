#!/usr/bin/env python3
"""Generate tiny synthetic PDF fixtures for US-002 tests. No personal resumes."""

from __future__ import annotations

from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "fixtures"
LOREM = (
    "Alex Example\n"
    "alex@example.test | +1-555-0100\n\n"
    "Experience\n"
    "Widget Co — Engineer (2020-2024)\n"
    "Built internal tools for document workflows. Collaborated with design and QA.\n"
    "Improved conversion reliability using automated fixture suites.\n\n"
    "Education\n"
    "Example University — B.S. Computer Science\n"
)


def write_text_pdf(path: Path, *, width: float, height: float, pages: int = 1) -> None:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page(width=width, height=height)
        page.insert_text((72, 72), f"{LOREM}\nPage {i + 1} of {pages}", fontsize=11)
    doc.save(path)
    doc.close()


def write_zero_page(path: Path) -> None:
    # PyMuPDF refuses to save empty docs; craft a minimal 0-page PDF.
    path.write_bytes(
        b"%PDF-1.4\n"
        b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        b"2 0 obj<< /Type /Pages /Kids [] /Count 0 >>endobj\n"
        b"xref\n0 3\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"trailer<< /Size 3 /Root 1 0 R >>\n"
        b"startxref\n110\n%%EOF\n"
    )


def _raster_page_pixmap() -> fitz.Pixmap:
    src = fitz.open()
    page = src.new_page(width=612, height=792)
    page.draw_rect(page.rect, color=(0.85, 0.85, 0.85), fill=(0.9, 0.9, 0.9))
    page.insert_text((72, 72), "HIDDEN SCAN PROXY", fontsize=1, color=(0.9, 0.9, 0.9))
    pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5), alpha=False)
    src.close()
    return pix


def write_image_only(path: Path) -> None:
    """Image-only page: raster of a blank rectangle, no extractable text."""
    pix = _raster_page_pixmap()
    doc = fitz.open()
    out = doc.new_page(width=612, height=792)
    out.insert_image(out.rect, pixmap=pix)
    # Tiny caption under threshold (well below 80 non-whitespace chars).
    out.insert_text((72, 780), "scan", fontsize=8)
    doc.save(path)
    doc.close()


def write_mixed_pages(path: Path) -> None:
    """Page 1 text + page 2 image-only → must fail scan_detected (no silent drop)."""
    pix = _raster_page_pixmap()
    doc = fitz.open()
    text_page = doc.new_page(width=612, height=792)
    text_page.insert_text((72, 72), LOREM, fontsize=11)
    scan_page = doc.new_page(width=612, height=792)
    scan_page.insert_image(scan_page.rect, pixmap=pix)
    scan_page.insert_text((72, 780), "scan", fontsize=8)
    doc.save(path)
    doc.close()


def write_encrypted(path: Path) -> None:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 72), LOREM, fontsize=11)
    doc.save(
        path,
        encryption=fitz.PDF_ENCRYPT_AES_256,
        user_pw="test-password",
        owner_pw="owner-password",
    )
    doc.close()


def write_corrupt(path: Path) -> None:
    # Valid header then truncated garbage — signature looks like PDF but unreadable.
    path.write_bytes(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n")


def write_non_pdf(path: Path) -> None:
    # PNG-ish bytes (not a PDF). Tests MIME/extension alone is insufficient.
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"not-a-pdf-payload"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_text_pdf(OUT / "a4_text.pdf", width=595.28, height=841.89, pages=1)
    write_text_pdf(OUT / "letter_text.pdf", width=612.0, height=792.0, pages=1)
    write_text_pdf(OUT / "letter_3pages.pdf", width=612.0, height=792.0, pages=3)
    write_text_pdf(OUT / "six_pages.pdf", width=612.0, height=792.0, pages=6)
    write_zero_page(OUT / "zero_pages.pdf")
    write_image_only(OUT / "image_only.pdf")
    write_mixed_pages(OUT / "mixed_pages.pdf")
    write_encrypted(OUT / "encrypted.pdf")
    write_corrupt(OUT / "corrupt.pdf")
    write_non_pdf(OUT / "not_pdf.bin")
    print(f"Wrote fixtures to {OUT}")


if __name__ == "__main__":
    main()
