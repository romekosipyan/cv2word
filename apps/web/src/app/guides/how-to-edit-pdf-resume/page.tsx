import type { Metadata } from "next";
import Link from "next/link";

import GuideArticle from "@/components/guides/GuideArticle";
import { FIDELITY_WARNING } from "@/lib/copy";
import { guidePath, requireGuide } from "@/lib/guides";

const guide = requireGuide("how-to-edit-pdf-resume");

export const metadata: Metadata = {
  title: "How to edit a PDF resume | ResumeToWord",
  description:
    "Get native editable text from a text-based resume PDF, then review and fix what shifted in Word.",
};

export default function HowToEditPdfResumePage() {
  return (
    <GuideArticle
      guide={guide}
      relatedSlugs={[
        "fix-formatting-after-conversion",
        "convert-pdf-resume-without-uploading",
      ]}
    >
      <p>
        When your resume or CV is stuck as a PDF, the usual goal is not to redraw
        every line by hand — it is to get native editable text in Word, then fix
        what the conversion shifted.
      </p>

      <h2>Start from a text-based PDF</h2>
      <p>
        ResumeToWord converts text-based PDFs only. If you still have the
        original Word, Google Docs, or Pages file, export a fresh PDF from that
        source when you can — that usually converts more cleanly than a
        print-to-PDF of a scan.
      </p>
      <p>
        ResumeToWord accepts a single PDF within the size and page limits shown
        on the converter. Password-protected files and non-PDF uploads are
        outside this flow. Preview convert is free; download is $1.99 USD.
      </p>

      <h2>Convert, then open the DOCX</h2>
      <p>
        Use the ResumeToWord converter on the{" "}
        <Link href="/">home page</Link>. After a successful preview, pay $1.99
        to download the DOCX and open it in Microsoft Word or a compatible
        editor.
      </p>
      <p>
        You should be able to click into headings and bullets as normal text. If
        the file behaves like a full-page image, the conversion did not meet our
        editable-text bar — do not treat that as a finished resume.
      </p>
      <ul>
        <li>Skim every section against your source PDF.</li>
        <li>Edit wording in Word; ResumeToWord does not rewrite your facts.</li>
        <li>Save your own copy — we do not store your files on our servers.</li>
      </ul>

      <h2>What to expect</h2>
      <p>{FIDELITY_WARNING}</p>
      <p>
        Layout is best-effort. Spacing, columns, and fonts can shift. That is
        expected; review before you send applications. For common cleanup
        patterns, see the{" "}
        <Link href={guidePath("fix-formatting-after-conversion")}>
          formatting guide
        </Link>
        . For two-column layouts, see the{" "}
        <Link href={guidePath("two-column-resume-pdf-to-word")}>
          two-column cleanup checklist
        </Link>
        .
      </p>
    </GuideArticle>
  );
}
