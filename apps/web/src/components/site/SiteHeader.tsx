import Link from "next/link";

type SiteHeaderProps = {
  current?: "home" | "guides";
};

export default function SiteHeader({ current }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link href="/" className="site-wordmark">
        ResumeToWord
      </Link>
      <nav aria-label="Site">
        <Link
          href="/guides"
          aria-current={current === "guides" ? "page" : undefined}
        >
          Guides
        </Link>
      </nav>
    </header>
  );
}
