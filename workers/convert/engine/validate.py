"""US-011 output validation and package sanitization.

Success requires native editable text, no omitted pages, and a safe DOCX
package. Never returns extracted resume text. Never embeds fonts. Never
creates macros.
"""

from __future__ import annotations

import io
import re
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

import pymupdf as fitz

from engine.font_policy import collect_font_warnings, map_font
from engine.native_check import MIN_NATIVE_CHARS, native_editable_ok

DEFAULT_FILENAME = "resume-editable.docx"

# Completeness gates for text PDFs that already passed inspect (not public 99% claims).
MIN_OVERALL_RECALL = 0.75
MIN_PAGE_RECALL = 0.45

WS_RE = re.compile(r"\s+")
INVISIBLE_RE = re.compile(r"[\u00ad\u200b\u200c\u200d\u2060\ufeff]")
DASH_RE = re.compile(r"[\u2010\u2011\u2012\u2013\u2014\u2212]")

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W_T = f"{{{W_NS}}}t"
W_SECTPR = f"{{{W_NS}}}sectPr"
W_BR = f"{{{W_NS}}}br"

MACRO_NAME_HINTS = (
    "vbaproject",
    "vbaData",
    "macrosheets",
    "activex",
)
EMBED_NAME_HINTS = (
    "word/embeddings/",
    "word/objects/",
    "word/fonts/",
    "word/activeX/",
)
UNSAFE_EXTERNAL_SCHEMES = (
    "file:",
    "javascript:",
    "vbscript:",
    "data:",
    "ms-its:",
    "mhtml:",
    "oleobject",
)
ALLOWED_EXTERNAL_SCHEMES = ("http:", "https:", "mailto:", "tel:")

NEUTRAL_CORE_XML = """<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title/><dc:subject/><dc:creator/><cp:keywords/><dc:description/><cp:lastModifiedBy/><cp:revision>1</cp:revision><cp:category/></cp:coreProperties>
"""


def _fail(reason: str, **extra: object) -> dict:
    out: dict = {
        "ok": False,
        "error": "output_invalid",
        "reason": reason,
    }
    out.update(extra)
    return out


def _canonicalize(text: str) -> str:
    text = INVISIBLE_RE.sub("", text or "")
    text = DASH_RE.sub("-", text)
    return text


def _normalize_chars(text: str) -> str:
    return WS_RE.sub("", _canonicalize(text))


def _char_multiset(text: str) -> Counter[str]:
    return Counter(_normalize_chars(text))


def _character_recall(expected: str, actual: str) -> float:
    exp = _char_multiset(expected)
    act = _char_multiset(actual)
    if not exp:
        return 1.0
    matched = sum(min(exp[ch], act[ch]) for ch in exp)
    return matched / sum(exp.values())


def _docx_body_text(path: Path) -> str:
    """In-memory body text for recall only — never returned to callers."""
    parts: list[str] = []
    with ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.startswith("word/") or not name.endswith(".xml"):
                continue
            if "rels" in name:
                continue
            if not any(
                key in name
                for key in ("document", "header", "footer", "footnotes", "endnotes")
            ):
                continue
            root = ElementTree.fromstring(zf.read(name))
            for node in root.iter(W_T):
                if node.text:
                    parts.append(node.text)
    return "".join(parts)


def _pdf_page_texts(pdf_path: Path) -> list[str]:
    doc = fitz.open(pdf_path)
    try:
        return [(page.get_text("text") or "") for page in doc]
    finally:
        doc.close()


def _pdf_font_families(pdf_path: Path) -> list[str]:
    families: list[str] = []
    doc = fitz.open(pdf_path)
    try:
        for page in doc:
            for font in page.get_fonts(full=True):
                # tuple: xref, ext, type, basefont, name, encoding, ...
                base = str(font[3] or "")
                name = str(font[4] or "")
                if base:
                    families.append(base)
                elif name:
                    families.append(name)
    finally:
        doc.close()
    return families


def _estimate_docx_pages(path: Path) -> int:
    """Estimate page count from pdf2docx-style sections / explicit breaks."""
    with ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    sects = list(root.iter(W_SECTPR))
    page_breaks = 0
    for br in root.iter(W_BR):
        if (br.get(f"{{{W_NS}}}type") or br.get("type") or "").lower() == "page":
            page_breaks += 1
    if sects:
        return max(1, len(sects))
    return max(1, page_breaks + 1)


def _package_has_macros(names: list[str]) -> bool:
    lowered = [n.lower() for n in names]
    for name in lowered:
        if any(hint.lower() in name for hint in MACRO_NAME_HINTS):
            return True
        if name.endswith(".bin") and "vba" in name:
            return True
    return False


def _is_drop_part(name: str) -> bool:
    lower = name.lower()
    if lower.startswith("customxml/"):
        return True
    if lower.startswith("docprops/thumbnail"):
        return True
    if any(hint.lower() in lower for hint in EMBED_NAME_HINTS):
        return True
    if any(hint.lower() in lower for hint in MACRO_NAME_HINTS):
        return True
    if lower.endswith((".bat", ".cmd", ".exe", ".dll", ".js", ".vbs")):
        return True
    return False


def _relationship_is_unsafe_external(elem: ElementTree.Element) -> bool:
    mode = (elem.get("TargetMode") or "").strip().lower()
    if mode != "external":
        return False
    target = (elem.get("Target") or "").strip()
    lower = target.casefold()
    if any(lower.startswith(scheme) for scheme in ALLOWED_EXTERNAL_SCHEMES):
        return False
    # Relative or empty external targets are unsafe.
    if not target or any(s in lower for s in UNSAFE_EXTERNAL_SCHEMES):
        return True
    # Unknown scheme → unsafe.
    if ":" in target.split("/", 1)[0]:
        return True
    return True


_REL_TAG_RE = re.compile(r"<Relationship\b[^>]*?/>", re.IGNORECASE | re.DOTALL)
_OVERRIDE_TAG_RE = re.compile(r"<Override\b[^>]*?/>", re.IGNORECASE | re.DOTALL)
_FONT_ATTR_RE = re.compile(
    r'(\b(?:w:)?(?:ascii|hAnsi|cs|eastAsia|name)=")([^"]+)(")',
    re.IGNORECASE,
)
_DROP_TARGET_HINTS = (
    "customxml/",
    "thumbnail",
    "embeddings/",
    "fonts/",
    "vbaproject",
    "activex",
    "objects/",
)


def _rels_target_should_drop(target: str, target_mode: str) -> bool:
    t_lower = target.replace("\\", "/").casefold()
    if any(part in t_lower for part in _DROP_TARGET_HINTS):
        return True
    if (target_mode or "").strip().lower() != "external":
        return False
    if any(t_lower.startswith(scheme) for scheme in ALLOWED_EXTERNAL_SCHEMES):
        return False
    return True


def _sanitize_rels_xml(data: bytes) -> bytes:
    """Remove unsafe/dropped relationships without rewriting the whole XML tree."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data

    def keep(match: re.Match[str]) -> str:
        tag = match.group(0)
        target_m = re.search(r'\bTarget="([^"]*)"', tag, re.IGNORECASE)
        mode_m = re.search(r'\bTargetMode="([^"]*)"', tag, re.IGNORECASE)
        target = target_m.group(1) if target_m else ""
        mode = mode_m.group(1) if mode_m else ""
        if _rels_target_should_drop(target, mode):
            return ""
        return tag

    cleaned = _REL_TAG_RE.sub(keep, text)
    return cleaned.encode("utf-8")


def _rewrite_fonts_in_xml(data: bytes) -> tuple[bytes, list[str]]:
    """Map font family attributes to approved names; preserve surrounding XML."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data, []
    warnings: list[str] = []
    seen: set[str] = set()

    def repl(match: re.Match[str]) -> str:
        prefix, current, suffix = match.group(1), match.group(2), match.group(3)
        target, codes = map_font(current)
        for code in codes:
            if code not in seen:
                seen.add(code)
                warnings.append(code)
        return f"{prefix}{target}{suffix}"

    rewritten = _FONT_ATTR_RE.sub(repl, text)
    if rewritten == text and not warnings:
        return data, []
    return rewritten.encode("utf-8"), warnings


def _rewrite_content_types(data: bytes) -> bytes:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return data

    def keep(match: re.Match[str]) -> str:
        tag = match.group(0).casefold()
        if any(
            hint in tag
            for hint in (
                "vbaproject",
                "macroenabled",
                "activex",
                "customxml",
                "/fonts/",
                "thumbnail",
            )
        ):
            return ""
        return match.group(0)

    return _OVERRIDE_TAG_RE.sub(keep, text).encode("utf-8")


def sanitize_docx_package(path: Path) -> dict:
    """Strip metadata/attachments/unsafe parts; rewrite fonts. Mutates file."""
    try:
        with ZipFile(path, "r") as zin:
            names = zin.namelist()
            if _package_has_macros(names):
                return _fail("macros_present")
            payloads: dict[str, bytes] = {}
            font_warnings: list[str] = []
            for name in names:
                if _is_drop_part(name):
                    continue
                data = zin.read(name)
                lower = name.casefold()
                if lower == "docprops/core.xml":
                    data = NEUTRAL_CORE_XML.encode("utf-8")
                elif lower == "[content_types].xml":
                    data = _rewrite_content_types(data)
                elif lower.endswith(".rels"):
                    data = _sanitize_rels_xml(data)
                elif lower.startswith("word/") and lower.endswith(".xml"):
                    data, warns = _rewrite_fonts_in_xml(data)
                    for code in warns:
                        if code not in font_warnings:
                            font_warnings.append(code)
                payloads[name] = data
    except BadZipFile:
        return _fail("package_invalid")

    # Re-check macros / embeds after filter.
    remaining = list(payloads)
    if _package_has_macros(remaining):
        return _fail("macros_present")
    if any(n.casefold().startswith("word/fonts/") for n in remaining):
        return _fail("embedded_fonts")
    if any("vbaproject" in n.casefold() for n in remaining):
        return _fail("macros_present")

    buf = io.BytesIO()
    with ZipFile(buf, "w", compression=ZIP_DEFLATED) as zout:
        for name, data in payloads.items():
            zout.writestr(name, data)
    path.write_bytes(buf.getvalue())
    return {"ok": True, "warnings": font_warnings}


def _has_unsafe_external_left(path: Path) -> bool:
    with ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.endswith(".rels"):
                continue
            try:
                root = ElementTree.fromstring(zf.read(name))
            except ElementTree.ParseError:
                continue
            for rel in root:
                if _relationship_is_unsafe_external(rel):
                    return True
    return False


def _core_metadata_is_stripped(path: Path) -> bool:
    with ZipFile(path) as zf:
        if "docProps/core.xml" not in zf.namelist():
            return True
        root = ElementTree.fromstring(zf.read("docProps/core.xml"))
    banned_text = []
    for node in root.iter():
        if node.text and node.text.strip():
            # revision number alone is fine
            local = node.tag.rsplit("}", 1)[-1]
            if local in {"revision"}:
                continue
            banned_text.append(node.text.strip())
    # After sanitize, creator/description must be empty.
    return not banned_text


def validate_output(
    docx_path: Path,
    *,
    expected_page_count: int,
    pdf_path: Path | None = None,
    min_chars: int = MIN_NATIVE_CHARS,
) -> dict:
    """Sanitize then validate. JSON-safe; never includes resume text."""
    if not docx_path.is_file() or docx_path.stat().st_size <= 0:
        return _fail("missing_or_empty", native_chars=0, image_count=0)

    # Prefer canonical download name; callers should write this path.
    if docx_path.name != DEFAULT_FILENAME:
        # Soft signal only — rename is the caller's responsibility; still validate.
        pass

    native = native_editable_ok(docx_path, min_chars=min_chars)
    if not native.get("ok"):
        return _fail(
            str(native.get("reason") or "image_only_or_empty"),
            native_chars=native.get("native_chars", 0),
            image_count=native.get("image_count", 0),
        )

    warnings: list[str] = []

    # Completeness vs source PDF (in-memory only).
    if pdf_path is not None and pdf_path.is_file():
        page_texts = _pdf_page_texts(pdf_path)
        body = _docx_body_text(docx_path)
        overall = "\n".join(page_texts)
        recall = _character_recall(overall, body)
        if recall < MIN_OVERALL_RECALL:
            return _fail(
                "materially_incomplete",
                native_chars=native.get("native_chars", 0),
                image_count=native.get("image_count", 0),
                recall=round(recall, 4),
            )
        for idx, page_text in enumerate(page_texts):
            page_chars = len(_normalize_chars(page_text))
            if page_chars < MIN_NATIVE_CHARS:
                continue
            page_recall = _character_recall(page_text, body)
            if page_recall < MIN_PAGE_RECALL:
                return _fail(
                    "omitted_pages",
                    native_chars=native.get("native_chars", 0),
                    image_count=native.get("image_count", 0),
                    expected_pages=expected_page_count,
                    omitted_page_index=idx + 1,
                )
        pdf_fonts = _pdf_font_families(pdf_path)
        for code in collect_font_warnings(pdf_fonts):
            if code not in warnings:
                warnings.append(code)

    try:
        docx_pages = _estimate_docx_pages(docx_path)
    except Exception:  # noqa: BLE001
        return _fail(
            "package_invalid",
            native_chars=native.get("native_chars", 0),
            image_count=native.get("image_count", 0),
        )

    if expected_page_count > 0 and docx_pages < expected_page_count:
        return _fail(
            "omitted_pages",
            native_chars=native.get("native_chars", 0),
            image_count=native.get("image_count", 0),
            expected_pages=expected_page_count,
            docx_pages=docx_pages,
        )

    sanitized = sanitize_docx_package(docx_path)
    if not sanitized.get("ok"):
        return _fail(
            str(sanitized.get("reason") or "package_invalid"),
            native_chars=native.get("native_chars", 0),
            image_count=native.get("image_count", 0),
        )
    for code in sanitized.get("warnings") or []:
        if code not in warnings:
            warnings.append(code)

    # Re-validate after rewrite (structure may change; text must remain).
    native_after = native_editable_ok(docx_path, min_chars=min_chars)
    if not native_after.get("ok"):
        return _fail(
            str(native_after.get("reason") or "image_only_or_empty"),
            native_chars=native_after.get("native_chars", 0),
            image_count=native_after.get("image_count", 0),
        )

    if _has_unsafe_external_left(docx_path):
        return _fail(
            "unsafe_external",
            native_chars=native_after.get("native_chars", 0),
            image_count=native_after.get("image_count", 0),
        )

    if not _core_metadata_is_stripped(docx_path):
        return _fail(
            "metadata_not_stripped",
            native_chars=native_after.get("native_chars", 0),
            image_count=native_after.get("image_count", 0),
        )

    with ZipFile(docx_path) as zf:
        names = zf.namelist()
    if _package_has_macros(names):
        return _fail("macros_present")
    if any(n.casefold().startswith("word/fonts/") for n in names):
        return _fail("embedded_fonts")
    if any(n.casefold().startswith("word/embeddings/") for n in names):
        return _fail("attachments_present")

    # Soft-hyphen signal (ADR-005): warn when source-like soft hyphens remain.
    try:
        body_after = _docx_body_text(docx_path)
        if "\u00ad" in body_after and "hyphen_encoding" not in warnings:
            warnings.append("hyphen_encoding")
    except Exception:  # noqa: BLE001
        pass

    return {
        "ok": True,
        "native_chars": native_after.get("native_chars", 0),
        "image_count": native_after.get("image_count", 0),
        "docx_pages": docx_pages,
        "warnings": warnings,
        "filename": DEFAULT_FILENAME,
    }


# Keep a small alias for tests / callers that only need the constant.
__all__ = ["DEFAULT_FILENAME", "validate_output", "sanitize_docx_package"]
