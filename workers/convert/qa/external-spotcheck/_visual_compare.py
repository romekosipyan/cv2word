"""Render first-page previews of original PDF vs LibreOffice-exported DOCX PDF."""
from __future__ import annotations

from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent
ORIG = ROOT / "selected"
PREV = ROOT / "docx-preview-pdf"
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)


def render(path: Path, out: Path, scale: float = 1.35) -> None:
    doc = pymupdf.open(path)
    pix = doc[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    pix.save(str(out))
    doc.close()


def side_by_side(left: Path, right: Path, out: Path) -> None:
    a = pymupdf.open(left)
    b = pymupdf.open(right)
    pa = a[0]
    pb = b[0]
    mat = pymupdf.Matrix(1.1, 1.1)
    pixa = pa.get_pixmap(matrix=mat, alpha=False)
    pixb = pb.get_pixmap(matrix=mat, alpha=False)
    # create new page wide enough for both
    w = pixa.width + pixb.width + 24
    h = max(pixa.height, pixb.height) + 40
    doc = pymupdf.open()
    page = doc.new_page(width=w, height=h)
    page.insert_text((12, 18), "PDF original", fontsize=11)
    page.insert_text((pixa.width + 24, 18), "DOCX via LibreOffice", fontsize=11)
    page.insert_image(
        pymupdf.Rect(8, 28, 8 + pixa.width, 28 + pixa.height),
        pixmap=pixa,
    )
    page.insert_image(
        pymupdf.Rect(pixa.width + 16, 28, pixa.width + 16 + pixb.width, 28 + pixb.height),
        pixmap=pixb,
    )
    # save as png via pixmap of composite page
    out_pix = page.get_pixmap(matrix=pymupdf.Matrix(1, 1), alpha=False)
    out_pix.save(str(out))
    doc.close()
    a.close()
    b.close()


for pdf in sorted(ORIG.glob("*.pdf")):
    stem = pdf.stem
    render(pdf, OUT / f"{stem}-pdf-p1.png")
    preview = PREV / f"{stem}.pdf"
    if preview.is_file() and preview.stat().st_size > 1000:
        render(preview, OUT / f"{stem}-docx-lo-p1.png")
        side_by_side(pdf, preview, OUT / f"{stem}-compare.png")
        print("compare", stem)
    else:
        print("missing preview", stem)

print("done")
