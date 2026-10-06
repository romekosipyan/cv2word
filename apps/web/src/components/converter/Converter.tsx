"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

import {
  FIDELITY_WARNING,
  PRIMARY_CTA,
  PRIVACY_SUMMARY,
  SUPPORTED_SUMMARY,
} from "@/lib/copy";
import { emitFileSelected } from "@/lib/events";
import { MAX_PAGES, MAX_UPLOAD_BYTES, MIN_PAGES } from "@/lib/pdf/limits";

import {
  clearActiveJob,
  loadActiveJob,
  saveActiveJob,
  type ActiveJobCredentials,
} from "./credentials";
import FailurePanel from "./FailurePanel";
import {
  completeUpload,
  createJob,
  deleteJob,
  downloadJob,
  JobApiError,
  putUpload,
  type JobStatusResponse,
} from "./jobApi";
import {
  failureForCode,
  messageForErrorCode,
  validateSelectedFile,
  type FailureView,
} from "./messages";
import { pollJobStatus } from "./pollJob";
import ResultPanel from "./ResultPanel";
import { DOWNLOAD_STARTED_NOTE } from "./resultCopy";
import {
  isCancellableStage,
  isDeletingJobState,
  isTerminalJobState,
  NAMED_STAGES,
  namedStageForJobState,
  type NamedStage,
} from "./stages";
import { triggerBrowserDownload } from "./triggerBrowserDownload";

type Phase =
  | "idle"
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "unavailable"
  | "deleting";

type ReadyMeta = {
  expiresAt: string;
  downloadAvailable: boolean;
};

const MAX_MIB = MAX_UPLOAD_BYTES / (1024 * 1024);

const TAB_CLOSE_COPY =
  "Closing this tab does not delete the job instantly — it expires automatically. You can cancel while waiting or converting.";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Converter() {
  const inputId = useId();
  const liveId = useId();
  const stagesId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const activeCredsRef = useRef<ActiveJobCredentials | null>(null);
  const lastAnnouncedRef = useRef<string>("");
  const phaseRef = useRef<Phase>("idle");

  const [file, setFile] = useState<File | null>(null);
  const [advisoryError, setAdvisoryError] = useState<string | null>(null);
  const [failure, setFailure] = useState<FailureView | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [namedStage, setNamedStage] = useState<NamedStage | null>(null);
  const [statusText, setStatusText] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [readyMeta, setReadyMeta] = useState<ReadyMeta | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  phaseRef.current = phase;

  const busy =
    phase === "uploading" || phase === "processing" || phase === "deleting";
  const formLocked = busy || downloading;

  function announce(message: string) {
    if (!message || message === lastAnnouncedRef.current) return;
    // Never put job ids or secrets in the live region.
    lastAnnouncedRef.current = message;
    setStatusText(message);
  }

  function stopPolling() {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
  }

  function enterFailure(
    code: string,
    options?: { retryAfterSeconds?: number },
  ) {
    const view = failureForCode(code, options);
    setFailure(view);
    setNamedStage(null);
    setPhase(view.variant === "unavailable" ? "unavailable" : "failed");
    announce(`${view.title}. ${view.message} Next: ${view.nextAction}`);
  }

  function applyStatus(status: JobStatusResponse): "continue" | "stop" {
    if (isDeletingJobState(status.state)) {
      setPhase("deleting");
      setNamedStage(null);
      setFailure(null);
      announce(messageForErrorCode("delete_pending"));
      return "continue";
    }

    if (status.state === "succeeded") {
      setReadyMeta({
        expiresAt: status.expiresAt,
        downloadAvailable: Boolean(status.downloadAvailable),
      });
      setPhase("ready");
      setNamedStage(null);
      setFailure(null);
      announce("Ready. Your Word file is ready to download.");
      return "stop";
    }

    if (status.state === "failed" || status.state === "cancelled") {
      enterFailure(status.error ?? "conversion_failed");
      return "stop";
    }

    if (isTerminalJobState(status.state)) {
      // deleted or other terminal — credentials no longer useful
      clearActiveJob();
      activeCredsRef.current = null;
      enterFailure("unauthorized");
      return "stop";
    }

    const stage = namedStageForJobState(status.state);
    if (stage) {
      setPhase("processing");
      setNamedStage(stage);
      setFailure(null);
      announce(stage);
      return "continue";
    }

    return "continue";
  }

  function startPolling(creds: ActiveJobCredentials) {
    stopPolling();
    activeCredsRef.current = creds;
    const controller = new AbortController();
    pollAbortRef.current = controller;

    void pollJobStatus(creds.id, creds.secret, controller.signal, {
      onStatus: (status) => {
        const next = applyStatus(status);
        return { action: next };
      },
      onDeletePending: () => {
        setPhase("deleting");
        setNamedStage(null);
        setFailure(null);
        announce(messageForErrorCode("delete_pending"));
        // Keep polling until access is gone or cleanup is otherwise confirmed.
        return { action: "continue" };
      },
      onError: (err) => {
        if (err instanceof JobApiError) {
          if (err.code === "unauthorized" || err.code === "expired") {
            clearActiveJob();
            activeCredsRef.current = null;
            if (phaseRef.current === "deleting") {
              // Access gone after cancel — still do not claim verified storage cleanup.
              const view = failureForCode("delete_pending");
              setFailure({
                ...view,
                message:
                  "Deletion was requested. Access is revoked. Cleanup may still be finishing; do not assume files are fully removed until confirmed.",
                nextAction:
                  "Start a fresh upload when you are ready. Closing the tab is not required.",
              });
              setPhase("failed");
              setNamedStage(null);
              announce(view.message);
            } else {
              enterFailure(err.code);
            }
            return { action: "stop" };
          }
          if (err.code === "rate_limited" || err.code === "queue_full") {
            // Transient during poll — keep going until pollJob budget ends.
            return { action: "continue" };
          }
          enterFailure(err.code, {
            retryAfterSeconds: err.retryAfterSeconds,
          });
          return { action: "stop" };
        }
        // Network blip — continue until consecutive budget in pollJob.
        return { action: "continue" };
      },
    }).catch(() => {
      /* aborted */
    });
  }

  // Same-tab resume: sessionStorage + cookie path from US-001. Never URL.
  useEffect(() => {
    const creds = loadActiveJob();
    if (!creds) return;
    activeCredsRef.current = creds;
    setPhase("processing");
    setNamedStage("Waiting");
    announce("Waiting");
    startPolling(creds);
    return () => stopPolling();
  }, []);

  function onFileChosen(next: File | null) {
    if (phase === "failed" || phase === "unavailable" || phase === "ready") {
      stopPolling();
      clearActiveJob();
      activeCredsRef.current = null;
      setPhase("idle");
      setNamedStage(null);
      setFailure(null);
      setReadyMeta(null);
      setDownloading(false);
      setDownloadStarted(false);
      setStatusText("");
      lastAnnouncedRef.current = "";
    }
    setFile(next);
    if (!next) {
      setAdvisoryError(null);
      return;
    }
    // Essential funnel only — size bucket, never filename (ADR-008 / SPEC-EVENTS).
    emitFileSelected(next);
    const check = validateSelectedFile(next);
    setAdvisoryError(check.ok ? null : check.message);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    onFileChosen(next);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const next = event.dataTransfer.files?.[0] ?? null;
    onFileChosen(next);
  }

  function resetToIdle() {
    stopPolling();
    clearActiveJob();
    activeCredsRef.current = null;
    setPhase("idle");
    setNamedStage(null);
    setFailure(null);
    setReadyMeta(null);
    setDownloading(false);
    setDownloadStarted(false);
    setAdvisoryError(null);
    setStatusText("");
    lastAnnouncedRef.current = "";
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onDownload() {
    const creds = activeCredsRef.current ?? loadActiveJob();
    if (!creds || downloading) return;
    if (readyMeta && !readyMeta.downloadAvailable) return;

    try {
      setDownloading(true);
      const blob = await downloadJob(creds.id, creds.secret);
      triggerBrowserDownload(blob);
      // Request started — do not claim the user saved or opened the file.
      setDownloadStarted(true);
      announce(DOWNLOAD_STARTED_NOTE);
    } catch (err) {
      if (err instanceof JobApiError) {
        if (err.code === "unauthorized" || err.code === "expired") {
          clearActiveJob();
          activeCredsRef.current = null;
          setReadyMeta(null);
        }
        enterFailure(err.code, {
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else {
        const view: FailureView = {
          ...failureForCode("conversion_failed"),
          title: "Download problem",
          message:
            "Could not start the download. Check your connection and try again.",
          nextAction:
            "Try Download editable DOCX again, or convert another resume.",
          actionKind: "retry_later",
        };
        setFailure(view);
        setPhase("failed");
        setNamedStage(null);
        announce(view.message);
      }
    } finally {
      setDownloading(false);
    }
  }

  async function onDeleteFiles() {
    const creds = activeCredsRef.current ?? loadActiveJob();
    if (!creds || downloading) return;

    try {
      setPhase("deleting");
      setNamedStage(null);
      setFailure(null);
      setReadyMeta(null);
      setDownloadStarted(false);
      announce(messageForErrorCode("delete_pending"));
      const result = await deleteJob(creds.id, creds.secret);
      if (result === "delete_pending") {
        setPhase("deleting");
        announce(messageForErrorCode("delete_pending"));
        // Keep polling honestly — do not claim deleted on 202 alone.
        startPolling(creds);
      }
    } catch (err) {
      if (err instanceof JobApiError) {
        enterFailure(err.code, {
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else {
        const view: FailureView = {
          ...failureForCode("conversion_failed"),
          title: "Could not delete",
          message: "Could not delete right now. Try again.",
          nextAction:
            "Try Delete my files again, or wait for the job to expire automatically.",
          actionKind: "retry_later",
        };
        setFailure(view);
        setPhase("failed");
        setNamedStage(null);
        announce(view.message);
      }
    }
  }

  async function runConvert() {
    if (formLocked) return;
    setFailure(null);
    const check = validateSelectedFile(file);
    if (!check.ok || !file) {
      const msg = check.ok
        ? "Choose a PDF resume before converting."
        : check.message;
      setAdvisoryError(msg);
      announce(msg);
      return;
    }

    try {
      setPhase("uploading");
      setNamedStage("Uploading");
      announce("Uploading");

      const created = await createJob(newIdempotencyKey());
      if (!created.secret) {
        throw new JobApiError("unauthorized", 401);
      }
      const creds = { id: created.id, secret: created.secret };
      saveActiveJob(creds);
      activeCredsRef.current = creds;

      await putUpload(created.upload, file);

      setPhase("processing");
      setNamedStage("Waiting");
      announce("Waiting");

      const status = await completeUpload(created.id, created.secret);

      if (status.error && status.state === "failed") {
        enterFailure(status.error);
        return;
      }

      const mapped = applyStatus(status);
      if (mapped === "continue") {
        startPolling(creds);
      }
    } catch (err) {
      if (err instanceof JobApiError) {
        enterFailure(err.code, {
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else {
        // Prefer a network-specific message without inventing a catalog code.
        const view: FailureView = {
          ...failureForCode("conversion_failed"),
          title: "Connection problem",
          message: "Network error. Check your connection and try again.",
          nextAction:
            "Check your connection, then choose a PDF and convert again.",
          actionKind: "start_fresh",
        };
        setFailure(view);
        setPhase("failed");
        setNamedStage(null);
        announce(`${view.title}. ${view.message}`);
      }
    }
  }

  async function onCancel() {
    const creds = activeCredsRef.current ?? loadActiveJob();
    if (!creds) return;
    if (!namedStage || !isCancellableStage(namedStage)) return;

    try {
      setPhase("deleting");
      setNamedStage(null);
      setFailure(null);
      announce(messageForErrorCode("delete_pending"));
      const result = await deleteJob(creds.id, creds.secret);
      if (result === "delete_pending") {
        setPhase("deleting");
        announce(messageForErrorCode("delete_pending"));
        // Keep polling honestly — do not claim deleted on 202 alone.
        startPolling(creds);
      }
    } catch (err) {
      if (err instanceof JobApiError) {
        enterFailure(err.code, {
          retryAfterSeconds: err.retryAfterSeconds,
        });
      } else {
        const view: FailureView = {
          ...failureForCode("conversion_failed"),
          title: "Could not cancel",
          message: "Could not cancel right now. Try again.",
          nextAction: "Try cancel again, or wait for the job to finish or expire.",
          actionKind: "retry_later",
        };
        setFailure(view);
        setPhase("failed");
        setNamedStage(null);
        announce(view.message);
      }
      // Resume stage polling if cancel failed mid-flight.
      if (
        activeCredsRef.current &&
        !(err instanceof JobApiError &&
          (err.code === "unauthorized" || err.code === "expired"))
      ) {
        startPolling(activeCredsRef.current);
      }
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (formLocked) return;
    void runConvert();
  }

  const showStages =
    phase === "uploading" ||
    phase === "processing" ||
    phase === "ready" ||
    phase === "deleting";
  const canCancel =
    phase === "processing" &&
    namedStage !== null &&
    isCancellableStage(namedStage);
  const showFailurePanel =
    (phase === "failed" || phase === "unavailable") && failure !== null;

  return (
    <section className="panel" aria-labelledby="converter-heading">
      <h2 id="converter-heading">Convert your resume</h2>
      <p className="hint">{SUPPORTED_SUMMARY}</p>

      <p className="warning" role="note">
        {FIDELITY_WARNING}
      </p>

      <p className="privacy">{PRIVACY_SUMMARY}</p>

      <ul className="meta-list" aria-label="Supported files and limits">
        <li>
          <strong>File type</strong>
          <span>PDF only (text-based). JPG, PNG, DOC, and DOCX are not accepted.</span>
        </li>
        <li>
          <strong>Size</strong>
          <span>
            Maximum {MAX_MIB} MiB ({MAX_UPLOAD_BYTES.toLocaleString()} bytes).
          </span>
        </li>
        <li>
          <strong>Pages</strong>
          <span>
            {MIN_PAGES} to {MAX_PAGES} pages. Scanned or image-only pages are not
            supported in P0.
          </span>
        </li>
        <li>
          <strong>Account</strong>
          <span>None. No email, sign-up, or checkout.</span>
        </li>
      </ul>

      <form onSubmit={onSubmit} noValidate>
        <div
          className="dropzone"
          data-active={dragActive ? "true" : "false"}
          data-has-file={file ? "true" : "false"}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="file-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openPicker}
              disabled={formLocked}
            >
              Choose PDF
            </button>
            <span className="file-name" aria-live="polite">
              {file ? file.name : "No file selected"}
            </span>
          </div>
          <p className="hint">
            Use Choose PDF (keyboard-accessible). Drag-and-drop is optional.
            Selecting a file does not start conversion.
          </p>
          <input
            ref={inputRef}
            id={inputId}
            className="visually-hidden"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onInputChange}
            disabled={formLocked}
            aria-describedby={liveId}
          />
          <label htmlFor={inputId} className="visually-hidden">
            Resume PDF file
          </label>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={formLocked || !file || Boolean(advisoryError)}
        >
          {busy ? "Working…" : PRIMARY_CTA}
        </button>
      </form>

      {advisoryError && !showFailurePanel ? (
        <div className="error-box" role="alert">
          {advisoryError}
        </div>
      ) : null}

      {showFailurePanel && failure ? (
        <FailurePanel failure={failure} onFreshUpload={resetToIdle} />
      ) : null}

      {showStages ? (
        <div className="status-box" role="status" aria-describedby={stagesId}>
          <p className="stage-current">
            {phase === "deleting" ? (
              <>
                <strong>Deletion in progress</strong>
                <span>
                  {" "}
                  — access is revoked. Do not assume files are fully removed until
                  cleanup is confirmed.
                </span>
              </>
            ) : phase === "ready" ? (
              <>
                <strong>Ready</strong>
                <span> — conversion finished. Download is below.</span>
              </>
            ) : (
              <>
                <strong>{namedStage ?? "Uploading"}</strong>
                <span> — no percentage progress; named stages only.</span>
              </>
            )}
          </p>

          {phase !== "ready" ? (
            <ol id={stagesId} className="stage-list" aria-label="Conversion stages">
              {NAMED_STAGES.map((stage) => {
                const current = namedStage === stage;
                const currentIndex = namedStage
                  ? NAMED_STAGES.indexOf(namedStage)
                  : -1;
                const stageIndex = NAMED_STAGES.indexOf(stage);
                const done = currentIndex >= 0 && stageIndex < currentIndex;
                return (
                  <li
                    key={stage}
                    data-current={current ? "true" : "false"}
                    data-done={done ? "true" : "false"}
                  >
                    {stage}
                    {current ? (
                      <span className="visually-hidden"> (current)</span>
                    ) : null}
                    {done && !current ? (
                      <span className="visually-hidden"> (completed)</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <span id={stagesId} className="visually-hidden">
              Conversion stages completed
            </span>
          )}

          {phase !== "ready" ? (
            <p className="hint stage-note">{TAB_CLOSE_COPY}</p>
          ) : null}

          {canCancel ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void onCancel()}
            >
              Cancel conversion
            </button>
          ) : null}

          {phase === "ready" && readyMeta ? (
            <ResultPanel
              expiresAt={readyMeta.expiresAt}
              downloadAvailable={readyMeta.downloadAvailable}
              downloading={downloading}
              downloadStarted={downloadStarted}
              onDownload={() => void onDownload()}
              onDelete={() => void onDeleteFiles()}
              onConvertAnother={resetToIdle}
            />
          ) : null}

          {phase === "deleting" ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetToIdle}
              style={{ marginTop: "0.65rem" }}
            >
              Convert another resume
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        id={liveId}
        className="sr-live"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusText}
      </div>
    </section>
  );
}
