"""ADR-005 font substitution helpers for US-011 validation.

Maps PDF/DOCX family names to approved Word-oriented names. Never embeds fonts.
Returns warning codes only — never font bytes or resume text.
"""

from __future__ import annotations

import re

# Identity / metric-safe approved names (Word-oriented).
APPROVED_BASE = frozenset(
    {
        "Calibri",
        "Arial",
        "Times New Roman",
        "Courier New",
        "Georgia",
    }
)

# Normalized source family → (docx_name, warn_codes)
# warn_codes may include font_substituted and/or font_metrics_risk.
_SUBSTITUTION: dict[str, tuple[str, tuple[str, ...]]] = {
    "calibri": ("Calibri", ()),
    "carlito": ("Calibri", ()),
    "arial": ("Arial", ()),
    "liberation sans": ("Arial", ()),
    "helvetica": ("Arial", ("font_substituted", "font_metrics_risk")),
    "helvetica neue": ("Arial", ("font_substituted", "font_metrics_risk")),
    "helvetica-bold": ("Arial", ("font_substituted", "font_metrics_risk")),
    "nimbus sans": ("Arial", ("font_substituted",)),
    "times new roman": ("Times New Roman", ()),
    "times": ("Times New Roman", ("font_substituted",)),
    "times-roman": ("Times New Roman", ("font_substituted",)),
    "liberation serif": ("Times New Roman", ()),
    "nimbus roman": ("Times New Roman", ("font_substituted",)),
    "courier new": ("Courier New", ()),
    "courier": ("Courier New", ("font_substituted",)),
    "liberation mono": ("Courier New", ()),
    "nimbus mono": ("Courier New", ("font_substituted",)),
    "georgia": ("Georgia", ()),
    "cambria": ("Times New Roman", ("font_substituted", "font_metrics_risk")),
    "constantia": ("Times New Roman", ("font_substituted", "font_metrics_risk")),
    "palatino": ("Times New Roman", ("font_substituted", "font_metrics_risk")),
    "garamond": ("Times New Roman", ("font_substituted", "font_metrics_risk")),
    "book antiqua": ("Times New Roman", ("font_substituted", "font_metrics_risk")),
    "verdana": ("Arial", ("font_substituted",)),
    "tahoma": ("Arial", ("font_substituted",)),
    "trebuchet ms": ("Arial", ("font_substituted",)),
    "gill sans": ("Arial", ("font_substituted",)),
    "futura": ("Arial", ("font_substituted",)),
    "optima": ("Arial", ("font_substituted",)),
    "myriad": ("Arial", ("font_substituted",)),
    "montserrat": ("Arial", ("font_substituted",)),
    "lato": ("Arial", ("font_substituted",)),
    "roboto": ("Arial", ("font_substituted",)),
    "open sans": ("Arial", ("font_substituted",)),
    "source sans": ("Arial", ("font_substituted",)),
    "consolas": ("Courier New", ("font_substituted",)),
    "menlo": ("Courier New", ("font_substituted",)),
    "monaco": ("Courier New", ("font_substituted",)),
    "source code pro": ("Courier New", ("font_substituted",)),
    "comic sans ms": ("Arial", ("font_substituted",)),
    "impact": ("Arial", ("font_substituted",)),
    "papyrus": ("Arial", ("font_substituted",)),
    "brush script": ("Arial", ("font_substituted",)),
    # PyMuPDF / Base14 aliases seen on synthetic fixtures.
    "helv": ("Arial", ("font_substituted", "font_metrics_risk")),
    "timo": ("Times New Roman", ("font_substituted",)),
    "cour": ("Courier New", ("font_substituted",)),
}

_STYLE_SUFFIX_RE = re.compile(
    r"[-,]?\s*(?:bold|italic|oblique|regular|medium|light|black|narrow|condensed|"
    r"expanded|wide|mt|ps|std|pro|book)\s*$",
    re.IGNORECASE,
)
_SUBSET_RE = re.compile(r"^[A-Z]{6}\+")


def normalize_family(name: str) -> str:
    """Normalize a font family for table lookup (not for display)."""
    text = (name or "").strip()
    text = _SUBSET_RE.sub("", text)
    text = text.replace("_", " ")
    # Drop style suffixes repeatedly.
    prev = None
    while prev != text:
        prev = text
        text = _STYLE_SUFFIX_RE.sub("", text).strip(" -,\t")
    return text.casefold()


def map_font(family: str) -> tuple[str, tuple[str, ...]]:
    """Return (approved DOCX name, warning codes). Unknown → Calibri + warn."""
    key = normalize_family(family)
    if not key:
        return ("Calibri", ("font_substituted",))
    if key in _SUBSTITUTION:
        return _SUBSTITUTION[key]
    # Prefix match for families like "Myriad Pro" / "Source Sans 3".
    for src, mapped in _SUBSTITUTION.items():
        if key.startswith(src + " ") or key.startswith(src + "-"):
            return mapped
    if family.strip() in APPROVED_BASE:
        return (family.strip(), ())
    return ("Calibri", ("font_substituted", "font_metrics_risk"))


def collect_font_warnings(families: list[str]) -> list[str]:
    """Deduplicated warning codes for a set of source families."""
    codes: list[str] = []
    seen: set[str] = set()
    for family in families:
        _target, warns = map_font(family)
        for code in warns:
            if code not in seen:
                seen.add(code)
                codes.append(code)
    return codes
