import pymupdf
from pathlib import Path

ROOT = Path(__file__).resolve().parent
print("id", "pdf_pages", "lo_pages", "lo_chars_p1", "lo_chars_all", "pdf_chars")
for pdf in sorted((ROOT / "selected").glob("*.pdf")):
    sid = pdf.stem
    lo = ROOT / "docx-preview-pdf" / f"{sid}.pdf"
    d1 = pymupdf.open(pdf)
    d2 = pymupdf.open(lo)
    c1 = sum(len((p.get_text("text") or "").strip()) for p in d1)
    c2_all = sum(len((p.get_text("text") or "").strip()) for p in d2)
    c2_p1 = len((d2[0].get_text("text") or "").strip()) if d2.page_count else 0
    print(sid, d1.page_count, d2.page_count, c2_p1, c2_all, c1)
    d1.close()
    d2.close()
