#!/usr/bin/env python3
"""US-010 pipeline tests. Synthetic fixtures only; never print resume text."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
FIXTURES = TESTS / "fixtures"
INSPECT_FIXTURES = ROOT / "inspect" / "fixtures"


def _ensure_fixtures() -> None:
    if not (FIXTURES / "simple_text.pdf").is_file():
        subprocess.check_call([sys.executable, str(TESTS / "generate_fixtures.py")])


class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _ensure_fixtures()
        # Import after fixtures so local runs without PYTHONPATH still work.
        sys.path.insert(0, str(ROOT))
        from engine.pipeline import run_pipeline  # noqa: WPS433

        cls.run_pipeline = staticmethod(run_pipeline)

    def test_text_pdf_produces_native_editable_docx(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "resume-editable.docx"
            result = self.run_pipeline(FIXTURES / "simple_text.pdf", out)
            self.assertTrue(result["ok"], msg=json.dumps(result))
            self.assertTrue(out.is_file())
            self.assertGreater(result["native_chars"], 80)
            self.assertEqual(result.get("filename"), "resume-editable.docx")
            # DOCX is a zip with word/document.xml containing w:t runs (not page images only).
            with zipfile.ZipFile(out) as zf:
                xml = zf.read("word/document.xml").decode("utf-8", errors="replace")
            self.assertIn("<w:t", xml)
            self.assertNotIn("text", result)
            self.assertNotIn("content", result)

    def test_image_only_scan_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.docx"
            result = self.run_pipeline(FIXTURES / "image_only.pdf", out)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "scan_detected")
            self.assertEqual(result["kind"], "validation")
            self.assertFalse(out.exists())

    def test_mixed_pages_scan_detected_no_silent_drop(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.docx"
            result = self.run_pipeline(FIXTURES / "mixed_pages.pdf", out)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "scan_detected")
            self.assertEqual(result["kind"], "validation")
            self.assertFalse(out.exists())

    def test_cli_json_no_resume_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "resume-editable.docx"
            proc = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "engine",
                    "--input",
                    str(FIXTURES / "simple_text.pdf"),
                    "--output",
                    str(out),
                ],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, 0, msg=proc.stderr)
            payload = json.loads(proc.stdout.strip().splitlines()[-1])
            self.assertTrue(payload["ok"])
            blob = proc.stdout + proc.stderr
            self.assertNotIn("alex@example.test", blob.lower())
            self.assertNotIn("Widget Co", blob)

    def test_inspect_fixture_letter_text(self) -> None:
        src = INSPECT_FIXTURES / "letter_text.pdf"
        if not src.is_file():
            self.skipTest("inspect fixture missing")
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.docx"
            # Copy so pipeline never depends on inspect cwd.
            pdf = Path(tmp) / "in.pdf"
            shutil.copy(src, pdf)
            result = self.run_pipeline(pdf, out)
            self.assertTrue(result["ok"], msg=json.dumps(result))
            self.assertGreater(result["native_chars"], 80)


if __name__ == "__main__":
    unittest.main()
