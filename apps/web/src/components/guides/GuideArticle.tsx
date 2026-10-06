import Link from "next/link";
import type { ReactNode } from "react";

import SiteHeader from "@/components/site/SiteHeader";
import { FIDELITY_WARNING } from "@/lib/copy";
import { guidePath, relatedGuides, type GuideEntry } from "@/lib/guides";

type GuideArticleProps = {
  guide: GuideEntry;
  relatedSlugs: string[];
  children: ReactNode;
};

export default function GuideArticle({
  guide,
  relatedSlugs,
  children,
}: GuideArticleProps) {
  const related = relatedGuides(guide.slug, relatedSlugs);

  return (
    <div className="site-shell">
      <SiteHeader current="guides" />
      <article className="guide-article">
        <p className="guide-back">
          <Link href="/guides">← All guides</Link>
        </p>
        <h1>{guide.title}</h1>
        <p className="warning" role="note">{FIDELITY_WARNING}</p>
        <div className="guide-body">{children}</div>
        {related.length > 0 ? (
          <section className="guide-related" aria-labelledby="related-guides">
            <h2 id="related-guides">Related guides</h2>
            <ul>
              {related.map((entry) => (
                <li key={entry.slug}>
                  <Link href={guidePath(entry.slug)}>{entry.title}</Link>
                  <p>{entry.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
}
