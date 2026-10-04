import { FIDELITY_WARNING } from "@/lib/copy";

import {
  CONVERT_ANOTHER_CTA,
  DELETE_FILES_CTA,
  DOWNLOAD_CTA,
  DOWNLOAD_STARTED_NOTE,
  DOWNLOAD_UNAVAILABLE_NOTE,
  READY_BODY,
  READY_HEADING,
  formatExpiryLabel,
} from "./resultCopy";

export type ResultPanelProps = {
  expiresAt: string;
  downloadAvailable: boolean;
  downloading: boolean;
  downloadStarted: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onConvertAnother: () => void;
};

/**
 * Succeeded-job result surface (SPEC-UI / US-020).
 * Download uses the authenticated API client — never a bare URL with secrets.
 */
export default function ResultPanel({
  expiresAt,
  downloadAvailable,
  downloading,
  downloadStarted,
  onDownload,
  onDelete,
  onConvertAnother,
}: ResultPanelProps) {
  const expiryLabel = formatExpiryLabel(expiresAt);

  return (
    <div className="result-panel" role="region" aria-labelledby="result-heading">
      <h3 id="result-heading" className="result-title">
        {READY_HEADING}
      </h3>
      <p className="result-body">{READY_BODY}</p>
      <p className="warning result-warning" role="note">
        {FIDELITY_WARNING}
      </p>
      <p className="result-expiry" data-testid="result-expiry">
        {expiryLabel}
      </p>

      <div className="result-actions">
        <button
          type="button"
          className="btn btn-primary result-download"
          onClick={onDownload}
          disabled={!downloadAvailable || downloading}
          aria-label={DOWNLOAD_CTA}
        >
          {downloading ? "Preparing download…" : DOWNLOAD_CTA}
        </button>

        {!downloadAvailable ? (
          <p className="hint" role="status">
            {DOWNLOAD_UNAVAILABLE_NOTE}
          </p>
        ) : null}

        {downloadStarted ? (
          <p className="hint result-download-note" role="status">
            {DOWNLOAD_STARTED_NOTE}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onDelete}
          disabled={downloading}
        >
          {DELETE_FILES_CTA}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onConvertAnother}
          disabled={downloading}
        >
          {CONVERT_ANOTHER_CTA}
        </button>
      </div>
    </div>
  );
}
