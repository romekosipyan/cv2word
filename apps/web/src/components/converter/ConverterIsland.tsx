"use client";

import dynamic from "next/dynamic";

import {
  FIDELITY_WARNING,
  PRIVACY_SUMMARY,
  SUPPORTED_SUMMARY,
} from "@/lib/copy";

const Converter = dynamic(() => import("./Converter"), {
  ssr: false,
  loading: () => (
    <section className="panel" aria-busy="true" aria-labelledby="converter-loading">
      <h2 id="converter-loading">Convert your resume</h2>
      <p className="hint">{SUPPORTED_SUMMARY}</p>
      <p className="warning" role="note">
        {FIDELITY_WARNING}
      </p>
      <p className="privacy">{PRIVACY_SUMMARY}</p>
      <p className="hint">Loading converter…</p>
    </section>
  ),
});

export default function ConverterIsland() {
  return <Converter />;
}
