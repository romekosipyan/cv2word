import type { FailureView } from "./messages";

type Props = {
  failure: FailureView;
  onFreshUpload: () => void;
};

function actionLabel(failure: FailureView): string {
  switch (failure.actionKind) {
    case "retry_later":
      return "Start over";
    case "wait_cleanup":
      return "Convert another resume";
    case "reselect":
    case "start_fresh":
    default:
      return "Choose another PDF";
  }
}

/**
 * Failure / expiry / unsupported surface (SPEC-UI).
 * Actionable copy only — no parser internals, secrets, or verified-deletion claims.
 */
export default function FailurePanel({ failure, onFreshUpload }: Props) {
  const unavailable = failure.variant === "unavailable";

  return (
    <div
      className={unavailable ? "unavailable-box" : "failure-box"}
      role="alert"
      data-variant={failure.variant}
      data-error-code={failure.code}
    >
      <h3 className="failure-title">{failure.title}</h3>
      <p className="failure-message">{failure.message}</p>
      <p className="failure-next">
        <strong>Next:</strong> {failure.nextAction}
      </p>
      {failure.credentialNote ? (
        <p className="failure-note">{failure.credentialNote}</p>
      ) : null}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onFreshUpload}
      >
        {actionLabel(failure)}
      </button>
    </div>
  );
}
