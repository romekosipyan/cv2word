import type { Metadata } from "next";
import Link from "next/link";

import GuideArticle from "@/components/guides/GuideArticle";
import { FIDELITY_WARNING } from "@/lib/copy";
import { guidePath, requireGuide } from "@/lib/guides";

const guide = requireGuide("fix-formatting-after-conversion");

export const metadata: Metadata = {
  title: "Fix formatting after conversion | ResumeToWord",
  description:
    "Common cleanup for bullets, columns, font substitutions, and spacing after converting a resume PDF to Word.",
};

export default function FixFormattingAfterConversionPage() {
  return (
    <GuideArticle
      guide={guide}
      relatedSlugs={[
        "how-to-edit-pdf-resume",
        "two-column-resume-pdf-to-word",
        "convert-pdf-resume-without-uploading",
      ]}
    >
      <p>
        A successful DOCX means editable text — not a pixel match. Use this
        guide after download when spacing, bullets, or columns look off.
      </p>

      <h2>Bullets and lists</h2>
      <p>
        PDF list markers often become plain characters or slightly different
        glyphs in Word. Check that each bullet still starts its own line and
        that nested levels did not flatten into one paragraph.
      </p>
      <p>
        If a bullet merged with the previous line, place the cursor at the join,
        press Enter, and re-apply Word&apos;s bullet style rather than inserting
        decorative symbols by hand.
      </p>

      <h2>Columns and reading order</h2>
      <p>
        Two-column resumes are a common risk. Sidebar skills or contact blocks
        can land above or inside the main timeline after conversion.
      </p>
      <p>
        Read top to bottom once without assuming the PDF&apos;s visual columns.
        If order looks wrong, cut and paste whole sections in Word until the
        narrative matches your source — do not rely on the converter to
        preserve every column frame.
      </p>
      <p>
        For a step-by-step checklist on two-column layouts, see the{" "}
        <Link href={guidePath("two-column-resume-pdf-to-word")}>
          two-column resume cleanup checklist
        </Link>
        .
      </p>

      <h2>Font substitutions and spacing</h2>
      <p>
        When a font is missing or restricted, the service may substitute an
        approved font and warn you. Substituted fonts can be wider or narrower,
        so line wraps and page breaks may move.
      </p>
      <p>
        Watch for missing glyphs (boxes), odd hyphenation in phone numbers, and
        stretched headings. Adjust font size or spacing locally in Word; we do
        not claim exact layout preservation.
      </p>
      <ul>
        <li>Confirm name, email, phone, and dates first.</li>
        <li>Check headings, bullets, and section order.</li>
        <li>Open links and verify they still work.</li>
        <li>Scan page breaks before you export or print.</li>
      </ul>

      <h2>When to re-export the source</h2>
      <p>{FIDELITY_WARNING}</p>
      <p>
        If cleanup takes longer than rewriting a short section, go back to your
        source document, simplify complex frames or text boxes, export a cleaner
        text PDF, and convert again.
      </p>
    </GuideArticle>
  );
}
