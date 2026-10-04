#!/usr/bin/env python3
"""Synthetic fixtures for US-010 convert tests. No personal resumes."""

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


def write_image_only(path: Path) -> None:
    src = fitz.open()
    page = src.new_page(width=612, height=792)
    page.draw_rect(page.rect, color=(0.85, 0.85, 0.85), fill=(0.9, 0.9, 0.9))
    pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5), alpha=False)
    src.close()

    doc = fitz.open()
    out = doc.new_page(width=612, height=792)
    out.insert_image(out.rect, pixmap=pix)
    out.insert_text((72, 780), "scan", fontsize=8)
    doc.save(path)
    doc.close()


def write_mixed_pages(path: Path) -> None:
    """Page 1 text + page 2 image-only → must fail scan_detected (no silent drop)."""
    src = fitz.open()
    blank = src.new_page(width=612, height=792)
    blank.draw_rect(blank.rect, color=(0.8, 0.8, 0.8), fill=(0.85, 0.85, 0.85))
    pix = blank.get_pixmap(matrix=fitz.Matrix(0.4, 0.4), alpha=False)
    src.close()

    doc = fitz.open()
    text_page = doc.new_page(width=612, height=792)
    text_page.insert_text((72, 72), LOREM, fontsize=11)
    scan_page = doc.new_page(width=612, height=792)
    scan_page.insert_image(scan_page.rect, pixmap=pix)
    scan_page.insert_text((72, 780), "x", fontsize=8)
    doc.save(path)
    doc.close()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    write_text_pdf(OUT / "simple_text.pdf", width=612.0, height=792.0, pages=1)
    write_text_pdf(OUT / "simple_text_3p.pdf", width=612.0, height=792.0, pages=3)
    write_image_only(OUT / "image_only.pdf")
    write_mixed_pages(OUT / "mixed_pages.pdf")
    print(f"Wrote fixtures to {OUT}")


if __name__ == "__main__":
    main()
