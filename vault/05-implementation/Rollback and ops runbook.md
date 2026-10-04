---
type: plan
tags:
  - plan
  - ops
  - launch
aliases:
  - Rollback and ops runbook
  - Ops runbook
---

# Rollback and ops runbook

P0 incident playbook for ResumeToWord. Stops **new uploads** when isolation or deletion safety fails, while **expiry and verified deletion keep running**. Canonical story: [[US-112 Rollback and ops runbook]]. Alert emit path: [[US-043]]; infra sketch: `infra/README.md`.

Do not paste resume contents, filenames, tokens, or raw request bodies into tickets, chat, or this note.

## When to shut down uploads

Trigger feature shutdown (do not wait for a full outage) if any of:

| Signal | Why |
|---|---|
| Isolation breach or worker egress / cross-job access suspicion | Stop intake until contained |
| Verified deletion broken (reconcile cannot reach `deleted`, false “deleted”, or lifecycle treated as proof) | Stop new originals/outputs |
| Sustained `cleanup_backlog` with sweeper unable to clear inventoried tiers | Prevent backlog growth |
| Human call during beta / launch incident | Product or security may order intake halt |

Capacity rejects (`queue_full`) and rate limits alone are **not** automatic shutdown — they are admission control ([[US-041]] / [[US-040]]). Escalate to shutdown when safety properties fail.

## Alert routing ([[US-043]])

In-process redacted alerts emit structured `console.warn` JSON with allowlisted fields only (`apps/web/src/lib/alerts/`). Names and defaults live in `infra/README.md`.

| Alert (`message`) | Severity (ops) | First response |
|---|---|---|
| `cleanup_backlog` | **Page / high** | Follow [Cleanup backlog recovery](#cleanup-backlog-recovery). Consider upload shutdown if reconcile is stuck. |
| `worker_crash_rate` | High | Check convert worker health, leases, DLQ; one infra retry only. Isolation suspicion → shutdown. |
| `conversion_failed_rate` | Medium → high if sustained | Engine / corpus issue; do not weaken output validation. |
| `queue_wait` | Medium | Scale ready workers or accept capacity rejects; not a deletion incident by itself. |
| `capacity_reject` | Info / medium | Expected under load; watch for coupling with crashes or cleanup. |

**Routing residual:** CloudWatch metric filters / SNS are **not** provisioned yet (`infra/README.md`). Until they are:

1. Tail web + sweeper process logs for `$.message` in the table above.
2. Page the on-call human named for the beta window (record name outside this vault if needed).
3. Open an incident note with opaque job ids, sanitized codes, counts/rates only.

**Forbidden in pages and tickets:** filenames, extracted text, tokens/secrets, bodies, document snapshots, raw URLs with credentials.

## Feature shutdown (stop uploads, keep deletion)

### Flag (implemented)

| Env | Effect |
|---|---|
| `UPLOADS_DISABLED=true` | Job API rejects **new** upload intake. Default unset/`false` = uploads allowed. |

Documented in `infra/README.md` and enforced in `apps/web` (`getConfig().uploadsDisabled` → `assertUploadsEnabled()`).

| Path | Behavior when `UPLOADS_DISABLED=true` |
|---|---|
| `POST /api/jobs` | `503` `{ error: "queue_full", retryAfterSeconds }` + `Retry-After` (catalog code; no new job / secret / upload auth). Logged with `reason=uploads_disabled`. |
| `POST /api/jobs/{id}/complete-upload` | Rejects when the job is still `created` / `uploading` (blocks enqueue of new convert work). Idempotent replay for already `queued`+ continues. |
| `GET` job / download | Unchanged (credentials still required). |
| `DELETE /api/jobs/{id}` | Unchanged — user cancel / delete still tombstones and schedules cleanup. |
| Expiry sweeper (`runExpirySweeper` / `ensureExpirySweeperStarted`) | **Must keep running** — do not stop the sweeper process or EventBridge rule to “fix” upload incidents. |

Response uses existing catalog code `queue_full` ([[SPEC-API]] / [[Failure Catalog]]) so the converter UI already exits processing with retry timing — do not invent a public “maintenance” claim beyond honest retry behavior.

### Procedure

1. **Decide** — isolation or deletion safety failure (or ordered halt).
2. **Enable flag** — set `UPLOADS_DISABLED=true` on the **web / job API** task definition (or local env) and redeploy / restart the web process so `getConfig()` picks it up.
3. **Confirm intake stopped** — `POST /api/jobs` returns `503` / `queue_full`; no new secrets or upload object keys issued.
4. **Confirm deletion continues** — sweeper interval still active; `DELETE` still accepted; backlog alert path still evaluated on sweep.
5. **Optional convert drain** — scale convert workers to zero only after deciding in-flight convert risk; **never** scale away or disable the sweeper/reconcile path.
6. **Communicate** — support intake uses the script below; do not promise email recovery of lost jobs.
7. **Clear flag** — set `UPLOADS_DISABLED=false` (or remove) only after isolation/deletion gates pass and a named human approves reopening intake.

### Rollback of a bad web deploy (distinct from upload shutdown)

1. Prefer re-deploy previous known-good web task revision **with sweeper still scheduled**.
2. If the bad revision is actively accepting unsafe uploads, set `UPLOADS_DISABLED=true` first, then roll back the revision.
3. Convert worker image rollback stays blocked on [[ADR-003 PyMuPDF License]] for any image that embeds PyMuPDF — do not push unlicensed images as a “fix.”

## Cleanup backlog recovery

Triggered by `cleanup_backlog` or manual suspicion that `deleted` was shown early. Contract: [[Deletion Contract]] / [[SPEC-STORAGE]] / [[US-032]].

1. **Do not** mark jobs `deleted` by hand or treat S3 lifecycle as proof.
2. Confirm sweeper is running (`expiry_sweep_completed` logs; EventBridge every 5 minutes when provisioned).
3. Inventory stuck `deleting` jobs by opaque id + age only (`oldestJobId`, `ageSeconds` from the alert).
4. For each stuck job, verify reconcile tiers: DB tombstone / access revoke → object keys → multipart uploads → temp disks → queue/DLQ empty → only then `deleted`.
5. Drain orphan queue references; abort incomplete multiparts; wipe per-job temp under the worker temp root.
6. If reconcile cannot complete, keep `UPLOADS_DISABLED=true`, page security, and leave jobs in non-deleted states until fixed.
7. After clear: confirm `cleanup_backlog` stops firing and record opaque counts in the incident note.

## Support intake

Public contact route is a launch gate ([[US-111]] / [[Privacy Contract]]). Until published, beta support uses a **private** ops channel (email or ticket queue named at kickoff — not invented here).

### Accept

- Opaque job id (if the user still has the result screen)
- Approximate UTC time of failure
- Sanitized error code shown in UI (catalog codes only)
- Browser / OS for editor issues ([[Editor Matrix]])
- Whether the user hit delete / expiry / download

### Never accept into tickets or shared logs

- Resume PDF/DOCX attachments or pasted resume text
- Job bearer secrets, upload tokens, raw cookie values
- Full URLs that embed credentials

### Escalation

| User report theme | Action |
|---|---|
| “Deleted” but file still retrievable / wrong job | Treat as deletion incident → shutdown uploads → cleanup recovery |
| Cross-user content or access | Isolation incident → shutdown uploads → security |
| Formatting / fidelity | Product/QA path; no shutdown unless paired with empty success |
| Queue / retry messages during known shutdown | Expected; point to retry later; no email recovery |

Honest copy only: formatting may change; review after conversion. No ATS, perfect layout, or demand claims ([[Claims and Non Goals]]).

## Related

- [[Launch Review Checklist]] — Operations row
- [[Architecture]] — sweeper, job API, workers
- [[US-041]] — capacity reject (not shutdown)
- [[US-043]] — redacted alerts
- `infra/README.md` — env names and alert wiring residual
---
