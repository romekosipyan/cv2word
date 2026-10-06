import type { Metadata } from "next";
import Link from "next/link";

import GuideArticle from "@/components/guides/GuideArticle";
import { FIDELITY_WARNING } from "@/lib/copy";
import { guidePath, requireGuide } from "@/lib/guides";

const guide = requireGuide("two-column-resume-pdf-to-word");

export const metadata: Metadata = {
  title: "Two-column resume PDF to Word: cleanup checklist | ResumeToWord",
  description:
    "After converting a two-column resume PDF to Word, sidebars and sections can move. A practical checklist for putting the order and layout back.",
};

export default function TwoColumnResumePdfToWordPage() {
  return (
    <GuideArticle
      guide={guide}
      relatedSlugs={[
        "fix-formatting-after-conversion",
        "how-to-edit-pdf-resume",
      ]}
    >
      <p>
        Two-column resumes look tidy as a PDF, but they are the layout most
        likely to shift when converted to Word. A PDF stores where text sits on
        the page, not which column it belongs to. The converter has to work out
        the reading order, and with a sidebar it doesn&apos;t always get it
        right.
      </p>
      <p>{FIDELITY_WARNING}</p>
      <p>
        This checklist assumes you converted a text-based PDF and can click into
        the text in Word. If the page behaves like one big image, start from the{" "}
        <Link href={guidePath("how-to-edit-pdf-resume")}>
          how to edit a PDF resume
        </Link>{" "}
        guide instead.
      </p>

      <h2>What usually goes wrong</h2>
      <ul>
        <li>
          <strong>Sidebar content lands in the wrong place.</strong> Skills,
          languages, or contact details can appear above your summary, between
          two jobs, or at the very end.
        </li>
        <li>
          <strong>Lines from both columns merge.</strong> A job title and a skill
          can end up on the same line.
        </li>
        <li>
          <strong>Text boxes or frames.</strong> The sidebar may come through as a
          floating text box that moves when you edit nearby text.
        </li>
        <li>
          <strong>Column widths change.</strong> If fonts are substituted, a
          narrow sidebar can wrap onto extra lines and push content to a second
          page.
        </li>
        <li>
          <strong>Background colours and dividers.</strong> A shaded sidebar or
          vertical line may disappear or sit in the wrong spot.
        </li>
      </ul>
      <p>None of this means the conversion failed. You have editable text. It needs arranging.</p>

      <h2>Before you start</h2>
      <ol>
        <li>
          Open your original PDF next to the Word document so you can compare
          them.
        </li>
        <li>
          In Word, turn on <strong>Show/Hide ¶</strong> (Home tab). Paragraph
          marks, tabs, and section breaks become visible, which makes merged lines
          easy to spot.
        </li>
        <li>Save a copy of the converted file before you change anything.</li>
      </ol>

      <h2>Checklist</h2>

      <h3>1. Fix the reading order first</h3>
      <ul className="checklist">
        <li>Read the document top to bottom once. Ignore how it looks; check only the order.</li>
        <li>
          List the sections as they should appear: name and contact, summary,
          experience, education, skills, and so on.
        </li>
        <li>Cut and paste whole sections until the order matches that list.</li>
        <li>
          Split any line where two columns merged: put the cursor at the join and
          press Enter.
        </li>
      </ul>

      <h3>2. Decide: keep two columns or go single-column</h3>
      <ul className="checklist">
        <li>
          <strong>Single-column</strong> is the quickest to clean up and the
          easiest to edit later. Put the sidebar sections (skills, languages,
          contact) at the top or bottom of the main column.
        </li>
        <li>
          <strong>Two columns</strong> are worth rebuilding if the layout
          matters to you. Use one of the methods below rather than trying to nudge
          floating boxes.
        </li>
      </ul>

      <h3>3. If you keep two columns, rebuild them on purpose</h3>
      <ul className="checklist">
        <li>
          <strong>Table method (most stable):</strong> insert a 2-column, 1-row
          table. Paste sidebar content in the narrow cell and main content in the
          wide cell. Set table borders to &quot;No Border&quot;.
        </li>
        <li>
          <strong>Columns method:</strong> Layout → Columns → Two (or
          &quot;Left&quot;). Use Layout → Breaks → Column Break to move content
          into the second column. Works best when both columns flow as plain
          text.
        </li>
        <li>
          Remove leftover floating text boxes once their content has been moved.
          Check that nothing is hidden behind them.
        </li>
      </ul>

      <h3>4. Contact details and links</h3>
      <ul className="checklist">
        <li>
          Name, email, phone, and location are correct and complete. Sidebars
          often hold these.
        </li>
        <li>Phone numbers didn&apos;t get hyphenated or split across lines.</li>
        <li>
          Email and LinkedIn/portfolio links open the right page (right-click →
          Edit Hyperlink to check).
        </li>
      </ul>

      <h3>5. Bullets, headings, and spacing</h3>
      <ul className="checklist">
        <li>
          Each bullet starts its own line. Re-apply Word&apos;s bullet style
          instead of typing symbols.
        </li>
        <li>
          Section headings use the same style throughout (Heading 1/2 or one
          consistent format).
        </li>
        <li>
          Spacing between sections is consistent. Use paragraph spacing (Layout →
          Spacing) rather than empty lines.
        </li>
        <li>
          Fonts: if a font was substituted, pick one font for the whole document
          and apply it everywhere.
        </li>
      </ul>

      <h3>6. Final pass</h3>
      <ul className="checklist">
        <li>
          Page count matches what you expect. Check for a stray second page caused
          by an empty paragraph or wider font.
        </li>
        <li>
          Dates, job titles, and employer names match your source PDF exactly.
        </li>
        <li>
          Export a fresh PDF from Word (File → Save As → PDF) and look at it once
          more before sending.
        </li>
      </ul>

      <h2>When rebuilding is faster</h2>
      <p>{FIDELITY_WARNING}</p>
      <p>
        If the sidebar is heavily designed — icons, skill bars, photos, overlapping
        shapes — it can be quicker to paste the text into a clean single-column
        document than to repair the converted layout. If you still have the
        original Word, Google Docs, or Pages file, edit that and export a fresh
        PDF instead. That&apos;s always the cleanest route.
      </p>
      <p>
        ResumeToWord gives you editable Word text from a text-based PDF. It
        doesn&apos;t rebuild designs or templates, and it doesn&apos;t check
        resumes for ATS systems. Arranging the layout is up to you, and this
        checklist is meant to make that quicker. For bullets, fonts, and general
        spacing issues, see the{" "}
        <Link href={guidePath("fix-formatting-after-conversion")}>
          fix formatting after conversion
        </Link>{" "}
        guide.
      </p>
    </GuideArticle>
  );
}
