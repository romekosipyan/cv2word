import type { ReactNode } from "react";
import { IBM_Plex_Sans, Syne } from "next/font/google";

import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata = {
  title: "ResumeToWord — PDF resume to editable Word",
  description:
    "Anonymous, free PDF to editable Word conversion. Formatting may change. Review your resume after conversion.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
