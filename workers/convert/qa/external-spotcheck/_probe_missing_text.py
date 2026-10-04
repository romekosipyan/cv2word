"""Probe why contact strings disappear (no PII dumped)."""
from __future__ import annotations

import re
from pathlib import Path

import pymupdf
from docx import Document

ROOT = Path(__file__).resolve().parent


def docx_raw(path: Path) -> str:
    # include XML text nodes roughly via python-docx + raw xml snippet counts
    d = Document(str(path))
    texts = []
    for p in d.paragraphs:
        texts.append(p.text or "")
    xml = d.element.body.xml
    return "\n".join(texts), xml


for sid in ["ext-04", "ext-05", "ext-08"]:
    pdf = next((ROOT / "selected").glob(f"{sid}-*.pdf"))
    docx = next((ROOT / "docx").glob(f"{sid}-*.docx"))
    doc = pymupdf.open(pdf)
    page0 = doc[0]
    raw = page0.get_text("rawdict")
    # find spans containing @ or digit runs
    hits = []
    for b in raw.get("blocks", []):
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                t = span.get("text") or ""
                if "@" in t or re.search(r"\d{3}[\d\-\s().]{4,}\d", t):
                    hits.append(
                        {
                            "text_len": len(t),
                            "has_at": "@" in t,
                            "font": span.get("font"),
                            "size": span.get("size"),
                            "bbox": [round(x, 1) for x in span.get("bbox", [])],
                            "chars": len(span.get("chars") or []),
                        }
                    )
    text, xml = docx_raw(docx)
    print("===", sid)
    print(" contact-like spans on p1:", len(hits))
    for h in hits[:8]:
        print(" ", h)
    print(" docx text has @", "@" in text, "xml has @", "@" in xml)
    print(" docx text has gmail?", "gmail" in text.lower(), "xml gmail?", "gmail" in xml.lower())
    # check if contact may be drawn as paths (no text)
    drawings = page0.get_drawings()
    print(" drawings", len(drawings), "images", sum(1 for b in page0.get_text("dict")["blocks"] if b.get("type") == 1))
    # extract chars around @ from pdf text with repr of separators
    full = page0.get_text("text")
    for m in re.finditer(r".{0,20}@{0,1}.{0,20}", full):
        s = m.group(0)
        if "@" in s or "mail" in s.lower() or "phone" in s.lower():
            # redact: keep only punctuation/structure
            red = re.sub(r"[A-Za-z0-9]", "X", s)
            print("  structure:", red)
    doc.close()
