#!/usr/bin/env python3
"""US-011 output validation tests. Synthetic fixtures only; never print resume text."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
FIXTURES = TESTS / "fixtures"

NEUTRAL_DOC = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:rFonts w:ascii="Helvetica" w:hAnsi="Helvetica"/></w:rPr>
      <w:t>Alex Example alex@example.test Widget Co Engineer Experience Education Example University</w:t>
    </w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
"""

MINIMAL_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>
"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>
"""

DOC_RELS_UNSAFE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="file:///C:/secret.txt" TargetMode="External"/>
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test/ok" TargetMode="External"/>
</Relationships>
"""

CORE_DIRTY = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:creator>Source Author From PDF</dc:creator>
  <dc:description>Confidential resume metadata</dc:description>
  <dc:title>Original Title</dc:title>
</cp:coreProperties>
"""


def _ensure_fixtures() -> None:
    if not (FIXTURES / "simple_text.pdf").is_file():
        import subprocess

        subprocess.check_call([sys.executable, str(TESTS / "generate_fixtures.py")])


def _write_docx(path: Path, *, document_xml: str, extras: dict[str, bytes] | None = None) -> None:
    extras = extras or {}
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", MINIMAL_TYPES)
        zf.writestr("_rels/.rels", ROOT_RELS)
        zf.writestr("word/document.xml", document_xml)
        zf.writestr("docProps/core.xml", CORE_DIRTY)
        for name, data in extras.items():
            zf.writestr(name, data)


def _doc_with_pages(page_count: int, *, chars_per_page: int = 120) -> str:
    chunks = []
    for i in range(page_count):
        body = ("PageContent" + str(i + 1) + "X") * max(1, chars_per_page // 12)
        chunks.append(
            f"<w:p><w:r><w:t>{body}</w:t></w:r></w:p><w:p><w:pPr><w:sectPr/></w:pPr></w:p>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(chunks)}</w:body></w:document>"
    )


class ValidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        _ensure_fixtures()
        sys.path.insert(0, str(ROOT))
        from engine.pipeline import run_pipeline  # noqa: WPS433
        from engine.validate import DEFAULT_FILENAME, validate_output  # noqa: WPS433

        cls.run_pipeline = staticmethod(run_pipeline)
        cls.validate_output = staticmethod(validate_output)
        cls.DEFAULT_FILENAME = DEFAULT_FILENAME

    def test_empty_docx_output_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "resume-editable.docx"
            _write_docx(
                path,
                document_xml=(
                    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                    "<w:body><w:p><w:r><w:t>hi</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"
                ),
            )
            result = self.validate_output(path, expected_page_count=1)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "output_invalid")
            self.assertIn(result["reason"], {"image_only_or_empty", "materially_incomplete"})

    def test_omitted_pages_block_success(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "resume-editable.docx"
            # One section while expecting three pages.
            _write_docx(path, document_xml=_doc_with_pages(1, chars_per_page=200))
            result = self.validate_output(path, expected_page_count=3)
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "output_invalid")
            self.assertEqual(result["reason"], "omitted_pages")

    def test_macros_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "resume-editable.docx"
            _write_docx(
                path,
                document_xml=_doc_with_pages(1, chars_per_page=200),
                extras={"word/vbaProject.bin": b"MZ-fake-macro"},
            )
            result = self.validate_output(path, expected_page_count=1)
            self.assertFalse(result["ok"])
            self.assertEqual(result["reason"], "macros_present")

    def test_metadata_and_unsafe_external_stripped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "resume-editable.docx"
            _write_docx(
                path,
                document_xml=NEUTRAL_DOC,
                extras={
                    "word/_rels/document.xml.rels": DOC_RELS_UNSAFE.encode("utf-8"),
                    "customXml/item1.xml": b"<x>secret</x>",
                    "docProps/thumbnail.jpeg": b"\xff\xd8\xfffake",
                },
            )
            result = self.validate_output(path, expected_page_count=1)
            self.assertTrue(result["ok"], msg=json.dumps(result))
            with zipfile.ZipFile(path) as zf:
                names = zf.namelist()
                self.assertNotIn("customXml/item1.xml", names)
                self.assertFalse(any(n.startswith("docProps/thumbnail") for n in names))
                core = zf.read("docProps/core.xml").decode("utf-8")
                self.assertNotIn("Source Author", core)
                self.assertNotIn("Confidential", core)
                rels = zf.read("word/_rels/document.xml.rels").decode("utf-8")
                self.assertNotIn("file:///", rels)
                self.assertIn("https://example.test/ok", rels)

    def test_pipeline_default_filename_and_font_warnings(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / self.DEFAULT_FILENAME
            result = self.run_pipeline(FIXTURES / "simple_text.pdf", out)
            self.assertTrue(result["ok"], msg=json.dumps(result))
            self.assertEqual(result["filename"], "resume-editable.docx")
            self.assertTrue(out.is_file())
            # Helvetica fixture → ADR-005 substitution warnings.
            self.assertIn("font_substituted", result["warnings"])
            with zipfile.ZipFile(out) as zf:
                self.assertFalse(any(n.startswith("word/fonts/") for n in zf.namelist()))
                core = zf.read("docProps/core.xml").decode("utf-8")
                self.assertNotIn("python-docx", core)
                xml = zf.read("word/document.xml").decode("utf-8")
                # Helvetica remapped toward Arial when present as rFonts.
                if "rFonts" in xml:
                    self.assertNotIn('w:ascii="Helvetica"', xml)

    def test_pipeline_multipage_succeeds(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "resume-editable.docx"
            result = self.run_pipeline(FIXTURES / "simple_text_3p.pdf", out)
            self.assertTrue(result["ok"], msg=json.dumps(result))
            self.assertEqual(result["page_count"], 3)
            self.assertGreaterEqual(result.get("docx_pages") or 0, 3)

    def test_materially_incomplete_vs_source_pdf(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "resume-editable.docx"
            # Enough native chars to pass absolute min, but not PDF recall.
            _write_docx(
                path,
                document_xml=(
                    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                    "<w:body><w:p><w:r><w:t>"
                    + ("UniqueTokenZZ " * 20)
                    + "</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"
                ),
            )
            result = self.validate_output(
                path,
                expected_page_count=1,
                pdf_path=FIXTURES / "simple_text.pdf",
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "output_invalid")
            self.assertEqual(result["reason"], "materially_incomplete")

    def test_no_resume_text_in_validate_result(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "resume-editable.docx"
            result = self.run_pipeline(FIXTURES / "simple_text.pdf", out)
            blob = json.dumps(result)
            self.assertNotIn("alex@example.test", blob.lower())
            self.assertNotIn("Widget Co", blob)
            self.assertNotIn("text", result)
            self.assertNotIn("content", result)


if __name__ == "__main__":
    unittest.main()
