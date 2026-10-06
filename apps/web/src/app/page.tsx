import Link from "next/link";

import ConverterIsland from "@/components/converter/ConverterIsland";
import SiteHeader from "@/components/site/SiteHeader";
import {
  FIDELITY_WARNING,
  HERO_TRUST_BULLETS,
  PRIVACY_SUMMARY,
  SUPPORTED_SUMMARY,
  TEXT_PDF_NOTE,
} from "@/lib/copy";
import { guidePath } from "@/lib/guides";

export default function HomePage() {
  return (
    <div className="site-shell">
      <SiteHeader current="home" />
      <header className="hero">
        <div>
          <p className="eyebrow">ResumeToWord · for resumes and CVs</p>
          <h1 className="hero-title">
            Edit your PDF resume in Word — without uploading it.
          </h1>
          <p className="lede">
            Turn a text-based PDF resume or CV into an editable Word document.
            Conversion runs in your browser, so your file stays on this device.
            Preview free; pay $1.99 only if you want to download.
          </p>
          <ul className="trust-bullets" aria-label="Why ResumeToWord">
            {HERO_TRUST_BULLETS.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          <p className="hero-microcopy">
            {SUPPORTED_SUMMARY}
            <br />
            {TEXT_PDF_NOTE}
            <br />
            <strong>{FIDELITY_WARNING}</strong>
          </p>
          <p className="hero-link">
            <Link href={guidePath("convert-pdf-resume-without-uploading")}>
              How local conversion works →
            </Link>
          </p>
        </div>
        <ConverterIsland />
      </header>

      <section className="section" aria-labelledby="how-heading">
        <h2 id="how-heading">What you get</h2>
        <p>
          A DOCX with native editable text you can open in Microsoft Word or
          compatible editors. Layout is best-effort; review spacing and columns
          before you send applications.
        </p>
        <p>
          <Link href="/guides/how-to-edit-pdf-resume">
            How to edit a PDF resume
          </Link>{" "}
          ·{" "}
          <Link href="/guides/fix-formatting-after-conversion">
            Fix formatting after conversion
          </Link>
        </p>
        <div className="compare" aria-label="Synthetic before and after example">
          <div className="compare-card">
            <span>Before</span>
            <p>
              Locked PDF resume — hard to tweak a bullet or job title without
              retyping.
            </p>
          </div>
          <div className="compare-card">
            <span>After</span>
            <p>
              Editable Word body text — adjust wording, then export or print
              when you are ready.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="limits-heading">
        <h2 id="limits-heading">Supported files and limits</h2>
        <p>{SUPPORTED_SUMMARY}. Your browser checks these limits before conversion starts.</p>
      </section>

      <section className="section" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Your document stays on your device</h2>
        <p>{PRIVACY_SUMMARY}</p>
      </section>
    </div>
  );
}
