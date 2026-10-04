import ConverterIsland from "@/components/converter/ConverterIsland";
import { FIDELITY_WARNING, PRIVACY_SUMMARY, SUPPORTED_SUMMARY } from "@/lib/copy";

export default function HomePage() {
  return (
    <div className="site-shell">
      <header className="hero">
        <div>
          <p className="hint" style={{ marginTop: 0 }}>
            Free · anonymous · single file
          </p>
          <h1 className="brand">ResumeToWord</h1>
          <p className="lede">
            Turn a text-based PDF resume or CV into an editable Word document —
            no account, no email, no checkout.
          </p>
          <p className="warning" role="note">
            {FIDELITY_WARNING}
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
        <p>{SUPPORTED_SUMMARY}. Server checks are authoritative.</p>
      </section>

      <section className="section" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Privacy</h2>
        <p>{PRIVACY_SUMMARY}</p>
      </section>
    </div>
  );
}
