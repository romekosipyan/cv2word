"""Re-export US-002 inspect gates for the convert pipeline.

Worker re-inspects before convert (defense in depth). Complete-upload still
runs the inspect sidecar first; this path must not OCR or print resume text.
"""

from __future__ import annotations

import sys
from pathlib import Path

_INSPECT_DIR = Path(__file__).resolve().parents[1] / "inspect"
_inspect_str = str(_INSPECT_DIR)
if _inspect_str not in sys.path:
    sys.path.insert(0, _inspect_str)

from inspect_pdf import (  # noqa: E402
    MAX_PAGES,
    MAX_UPLOAD_BYTES,
    SCAN_CHARS_PER_PAGE,
    inspect_path,
    normalize_chars,
)

__all__ = [
    "MAX_PAGES",
    "MAX_UPLOAD_BYTES",
    "SCAN_CHARS_PER_PAGE",
    "inspect_path",
    "normalize_chars",
]
