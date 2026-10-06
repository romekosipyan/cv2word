import type { Metadata } from "next";
import Link from "next/link";

import SiteHeader from "@/components/site/SiteHeader";
import { FIDELITY_WARNING } from "@/lib/copy";
import { GUIDES, guidePath } from "@/lib/guides";

export const metadata: Metadata = {
  title: "Resume guides | ResumeToWord",
  description:
    "Practical guides for converting, editing, and fixing resume PDFs after conversion to Word.",
};

export default function GuidesIndexPage() {
  return (
    <div className="site-shell">
      <SiteHeader current="guides" />
      <main className="guide-index">
        <h1>Resume conversion guides</h1>
        <p className="lede">
          Original support content for editing and reviewing your resume after
          conversion. {FIDELITY_WARNING}
        </p>
        <ul className="guide-index-list">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <h2>
                <Link href={guidePath(guide.slug)}>{guide.title}</Link>
              </h2>
              <p>{guide.description}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
