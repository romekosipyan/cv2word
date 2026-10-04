#!/usr/bin/env python3
"""CLI for convert + validate pipeline (US-010 / US-011).

Reads a local PDF path, writes resume-editable.docx, prints one JSON object
to stdout. Never prints extracted resume text. No OCR. No URL fetches.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from engine.pipeline import run_pipeline


def _strip_text_fields(result: dict) -> dict:
    banned = {
        "text",
        "content",
        "page_text",
        "extract",
        "chars_sample",
        "resume_text",
        "body",
    }
    for key in banned:
        result.pop(key, None)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="ResumeToWord convert + validate pipeline (US-010/US-011)"
    )
    parser.add_argument("--input", type=Path, required=True, help="Absolute path to source PDF")
    parser.add_argument("--output", type=Path, required=True, help="Absolute path for DOCX output")
    parser.add_argument(
        "--size-bytes",
        type=int,
        default=None,
        help="Optional size override (object-store metadata)",
    )
    args = parser.parse_args(argv)

    try:
        result = run_pipeline(args.input, args.output, size_bytes=args.size_bytes)
    except OSError:
        result = {
            "ok": False,
            "error": "corrupt",
            "kind": "validation",
            "page_count": 0,
        }

    result = _strip_text_fields(result)
    print(json.dumps(result, separators=(",", ":")))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
