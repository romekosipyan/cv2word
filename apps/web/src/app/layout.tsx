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
  title: "ResumeToWord — Convert a PDF resume to Word without uploading",
  description:
    "Turn a text-based PDF resume or CV into an editable Word file in your browser. Your file isn't uploaded. Free preview, $1.99 to download.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
