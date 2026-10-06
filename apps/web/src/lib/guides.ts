export type GuideEntry = {
  slug: string;
  title: string;
  description: string;
};

export const GUIDES: GuideEntry[] = [
  {
    slug: "how-to-edit-pdf-resume",
    title: "How to edit a PDF resume",
    description:
      "Recover editable text from a text-based resume PDF and review it in Word.",
  },
  {
    slug: "fix-formatting-after-conversion",
    title: "Fix formatting after conversion",
    description:
      "Common cleanup for bullets, columns, font substitutions, and spacing after download.",
  },
  {
    slug: "convert-pdf-resume-without-uploading",
    title: "Convert a PDF resume to Word without uploading",
    description:
      "Where your CV goes when you convert it, and how to keep conversion on your device.",
  },
  {
    slug: "two-column-resume-pdf-to-word",
    title: "Two-column resume PDF to Word: cleanup checklist",
    description:
      "A practical checklist when sidebar content or columns shift after conversion.",
  },
];

export function guidePath(slug: string): string {
  return `/guides/${slug}`;
}

export function guideBySlug(slug: string): GuideEntry | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function requireGuide(slug: string): GuideEntry {
  const guide = guideBySlug(slug);
  if (!guide) {
    throw new Error(`Guide metadata missing for ${slug}`);
  }
  return guide;
}

export function relatedGuides(
  slug: string,
  relatedSlugs: string[],
): GuideEntry[] {
  return relatedSlugs
    .map((relatedSlug) => guideBySlug(relatedSlug))
    .filter((guide): guide is GuideEntry => guide !== undefined && guide.slug !== slug);
}
