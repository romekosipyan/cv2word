import type { Metadata } from "next";
import Link from "next/link";

import GuideArticle from "@/components/guides/GuideArticle";
import { FIDELITY_WARNING, SUPPORTED_SUMMARY } from "@/lib/copy";
import { guidePath, requireGuide } from "@/lib/guides";

const guide = requireGuide("convert-pdf-resume-without-uploading");

export const metadata: Metadata = {
  title: "Convert a PDF resume to Word without uploading | ResumeToWord",
  description:
    "Where your CV goes when you convert it, and how to turn a text-based PDF resume into an editable Word file without sending it to a server.",
};

export default function ConvertPdfResumeWithoutUploadingPage() {
  return (
    <GuideArticle
      guide={guide}
      relatedSlugs={["how-to-edit-pdf-resume", "fix-formatting-after-conversion"]}
    >
      <p>
        A resume holds your name, phone number, email, address, and work history
        in one file. Before you convert it, it is reasonable to ask where that
        file goes.
      </p>
      <p>{FIDELITY_WARNING}</p>

      <h2>What &quot;uploading&quot; means here</h2>
      <p>
        Most online converters send your PDF to their servers, convert it
        there, and send a Word file back. Many of them delete files after a set
        time and explain this in their privacy policy. Even so, a copy of your
        document leaves your device for a while.
      </p>
      <p>
        ResumeToWord works differently. The converter runs inside your browser
        using Pyodide, so the conversion happens on your device. We do not upload
        your PDF to our servers. We do not use document text for training, ads,
        or profiling. Payment for the download is handled by Stripe, which
        receives payment details, not your resume.
      </p>

      <h2>Your options, side by side</h2>
      <p>
        This is a factual comparison, not a ranking. Each option suits different
        people. Check each provider&apos;s current policy yourself before you
        rely on it.
      </p>
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th scope="col">Option</th>
              <th scope="col">Where conversion happens</th>
              <th scope="col">Account needed</th>
              <th scope="col">Cost</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Opening the PDF in Microsoft Word (desktop)</th>
              <td>On your computer</td>
              <td>Needs a Word licence</td>
              <td>Included with Word</td>
              <td>
                Word can open a PDF and turn it into an editable document. No
                upload is needed for the conversion itself. Layout can change.
              </td>
            </tr>
            <tr>
              <th scope="row">Google Docs (open PDF from Drive)</th>
              <td>Google&apos;s servers</td>
              <td>Google account</td>
              <td>Free</td>
              <td>
                The PDF is uploaded to your Google Drive first, then opened as a
                Google Doc. You can then download it as .docx. Complex layouts
                often come out simplified.
              </td>
            </tr>
            <tr>
              <th scope="row">Adobe Acrobat online converter</th>
              <td>Adobe&apos;s servers</td>
              <td>Adobe may ask you to sign in to download</td>
              <td>Free tier and paid plans</td>
              <td>
                Adobe&apos;s own policies describe how uploaded files are stored
                and handled. Desktop Acrobat Pro can also export to Word on your
                computer.
              </td>
            </tr>
            <tr>
              <th scope="row">Smallpdf</th>
              <td>Smallpdf&apos;s servers</td>
              <td>Optional for basic use; limits apply</td>
              <td>Free tier and paid plans</td>
              <td>
                Smallpdf&apos;s policy describes automatic deletion of processed
                files after a period of time.
              </td>
            </tr>
            <tr>
              <th scope="row">ResumeToWord (this site)</th>
              <td>In your browser, on your device</td>
              <td>No account, no email</td>
              <td>Free preview; $1.99 USD to download</td>
              <td>
                Text-based PDFs only, 1–5 pages, up to 10 MiB. Not OCR.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="guide-note">
        <em>Last checked: 6 October 2026.</em>
      </p>
      <p>
        If you already have Word on your desktop, opening the PDF there is a
        good local option and costs nothing extra. ResumeToWord is useful when
        you don&apos;t have desktop Word on the device you&apos;re using, or
        when you want a quick conversion in the browser without signing in
        anywhere.
      </p>

      <h2>How to convert without uploading</h2>
      <ol>
        <li>
          <strong>Check that your PDF is text-based.</strong> Open it and try to
          select a line of text. If you can highlight individual words,
          it&apos;s text-based. If the whole page highlights as one picture,
          it&apos;s a scan or image, and ResumeToWord will reject it.
        </li>
        <li>
          <strong>Check the limits.</strong> {SUPPORTED_SUMMARY}. Most resumes
          are well inside this.
        </li>
        <li>
          <strong>Choose your PDF on the home page.</strong> Your browser checks
          the limits before conversion starts.
        </li>
        <li>
          <strong>Preview for free.</strong> The conversion runs on your device.
          You&apos;ll see the result before paying.
        </li>
        <li>
          <strong>Download for $1.99</strong> if the preview is usable. Payment
          goes through Stripe. No account or email is needed.
        </li>
        <li>
          <strong>Open the DOCX in Word</strong> or a compatible editor and
          review it against your original.
        </li>
      </ol>

      <h2>How to check it really stays local</h2>
      <p>
        You don&apos;t have to take our word for it. If you&apos;re comfortable
        with browser developer tools:
      </p>
      <ul>
        <li>Open the Network tab before you choose your file.</li>
        <li>Run the preview convert.</li>
        <li>
          You&apos;ll see the converter&apos;s code load, but no request sending
          your PDF to our servers.
        </li>
      </ul>

      <h2>What ResumeToWord does not do</h2>
      <ul>
        <li>
          <strong>It is not OCR.</strong> Scanned or photographed resumes are not
          supported. If you only have a scan, you&apos;ll need an OCR tool, or
          to retype it from the source.
        </li>
        <li>
          <strong>It does not score or check your resume for ATS systems.</strong>
        </li>
        <li>
          <strong>It does not rebuild your resume into a template</strong> or
          rewrite your content.
        </li>
        <li>
          <strong>It does not promise an exact layout match.</strong> You get
          editable Word text, not a pixel copy.
        </li>
      </ul>

      <h2>After you convert</h2>
      <p>{FIDELITY_WARNING}</p>
      <p>
        Check your name, contact details, and dates first. Then look at section
        order, bullets, and page breaks. If your resume uses two columns, the{" "}
        <Link href={guidePath("two-column-resume-pdf-to-word")}>
          two-column cleanup checklist
        </Link>{" "}
        covers the usual fixes. Save the DOCX somewhere you control. We do not
        store a copy.
      </p>
    </GuideArticle>
  );
}
