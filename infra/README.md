# Infra sketch (not provisioned)

Planning shape from [[ADR-002 Hosting Store and Queue]] and [[ADR-001 Processing Region]]. Do not create cloud resources from this file. No Terraform or Bicep lives here yet.

## Recommended services

| Role | Service | Notes |
|---|---|---|
| Region | AWS `eu-central-1` | Candidate only; launch country is a human decision |
| Web + job API | ECS/Fargate service | Next.js; conversion does not run here |
| Convert workers | ECS/Fargate tasks | Non-root, read-only root, no public IP, no NAT |
| Object store | S3 originals + outputs | Block Public Access; versioning off; no file backups |
| Job metadata | RDS PostgreSQL | Opaque fields only; never extracted resume text |
| Queue | SQS + DLQ | Visibility timeout = lease; one infra retry |
| Sweeper | EventBridge every 5 minutes | Reconcile then mark `deleted`; lifecycle is not proof |
| Secrets | Secrets Manager | Never in URLs, query strings, or analytics |
| Logs / alerts | CloudWatch | Sanitized codes and opaque IDs only |

Worker subnet has no default route to the internet. Egress is VPC endpoints only.

**US-072 / US-013 endpoint inventory (no NAT):** interface endpoints `ecr.api` + `ecr.dkr` + logs + secretsmanager + sqs; **S3 gateway** for image layers and object I/O. A single “ECR” endpoint is incomplete and will fail closed.

### Convert worker isolation drafts ([[US-013]])

See `infra/convert-worker/`. Local compose dry-run uses an isolation image that **does not embed PyMuPDF**. Public/ECR publish of a convert worker that embeds PyMuPDF stays **blocked** until [[ADR-003 PyMuPDF License]] is accepted (`human_reviewer` TBD). Tag any local image `LOCAL_SPIKE_ONLY` and do not push.

## Env names (values stay out of git)

### Shared

```
AWS_REGION=eu-central-1
```

### Web / job API

```
DATABASE_URL=
JOB_SECRET_PEPPER=
S3_ORIGINALS_BUCKET=
S3_OUTPUTS_BUCKET=
QUEUE_URL=
QUEUE_DLQ_URL=
CAPACITY_MAX_WAIT_SECONDS=120
CAPACITY_READY_WORKERS=10
CAPACITY_P50_JOB_SECONDS=30
FREE_QUOTA_PER_24H=3
FREE_QUOTA_WINDOW_SECONDS=86400
RATE_LIMIT_CREATE_MAX=10
RATE_LIMIT_CREATE_WINDOW_SECONDS=60
RATE_LIMIT_POLL_MAX=60
RATE_LIMIT_POLL_WINDOW_SECONDS=60
RATE_LIMIT_DOWNLOAD_MAX=20
RATE_LIMIT_DOWNLOAD_WINDOW_SECONDS=60
UPLOADS_DISABLED=false
```

`UPLOADS_DISABLED=true` is the US-112 feature-shutdown switch: `POST /api/jobs` and incomplete `complete-upload` reject with catalog `queue_full` while expiry sweeper and `DELETE` continue. Playbook: [[Rollback and ops runbook]] (`vault/05-implementation/Rollback and ops runbook.md`).

`CAPACITY_P50_JOB_SECONDS` is an **unmeasured placeholder** (not Reliability Targets p95 truth). Job API: `predicted_wait ≈ (queued + in_flight) × p50 / max(ready_workers, 1)`; if `> CAPACITY_MAX_WAIT_SECONDS` → `queue_full` on `POST /api/jobs` with `Retry-After` / `retryAfterSeconds`. No charge. Implemented in `apps/web/src/lib/capacity/` ([[US-041]]).

Free quota defaults to **3 jobs / 24h / session** pending [[ADR-007 Free Quota]] (`FREE_QUOTA_*`). Create/poll/download request rate limits are hashed-client keyed (`RATE_LIMIT_*`); rejects return `rate_limited` with `Retry-After` / `retryAfterSeconds` and never charge. Implemented in `apps/web/src/lib/ratelimit/` ([[US-040]]).

### Convert worker

```
DATABASE_URL=
S3_ORIGINALS_BUCKET=
S3_OUTPUTS_BUCKET=
QUEUE_URL=
WORKER_CPU=1
WORKER_MEMORY_MIB=1024
WORKER_TMP_MIB=256
WORKER_TIMEOUT_SECONDS=120
WORKER_RASTER_MP=20
```

Fargate must request 1 vCPU / 2 GiB (platform minimum). Product RSS cap stays **1 GiB** via compose `mem_limit` / entrypoint cgroup — never set `WORKER_MEMORY_MIB=2048` to match the platform. Job temp lives on a 256 MiB `tmpfs`, not the 20 GiB Fargate ephemeral disk. Cap matrix: `infra/convert-worker/README.md` ([[US-041]]).

### Sweeper

```
DATABASE_URL=
S3_ORIGINALS_BUCKET=
S3_OUTPUTS_BUCKET=
QUEUE_URL=
SWEEPER_INTERVAL_SECONDS=300
SWEEPER_EXPIRE_AFTER_SECONDS=3600
```

## Alerts (redacted) — [[US-043]]

In-process redacted alert hooks live in `apps/web/src/lib/alerts/`. They emit sanitized warn lines suitable for CloudWatch metric filters / SNS. **CloudWatch alarms, SNS topics, and dashboards are not provisioned in this repo yet** — wire the log messages below in ops when infra is stood up.

| Alert name (`message`) | Trigger (defaults) | Allowed fields |
|---|---|---|
| `worker_crash_rate` | ≥ `ALERT_WORKER_CRASH_THRESHOLD_COUNT` (3) crashes in `ALERT_WORKER_CRASH_WINDOW_SECONDS` (300) | `crashes`, `count`, `windowSeconds`, `thresholdCount`, opaque `jobId`, `engineVersion` |
| `cleanup_backlog` | Deleting jobs older than `CLEANUP_BACKLOG_ALERT_SECONDS` (300) | `count`, `oldestJobId`, `ageSeconds`, `thresholdSeconds` |
| `queue_wait` | Predicted wait > `ALERT_QUEUE_WAIT_SECONDS` (15; Reliability Targets planning p95) | `predictedWaitSeconds`, `thresholdSeconds`, `depth`, `readyWorkers` |
| `conversion_failed_rate` | ≥ `ALERT_CONVERSION_FAILED_MIN_SAMPLES` (5) and rate ≥ `ALERT_CONVERSION_FAILED_RATE_BPS` (5000 = 50%) in window | `failures`, `samples`, `rateBps`, `windowSeconds`, `thresholdRateBps`, catalog `error`, `engineVersion` |
| `capacity_reject` | Job API `queue_full` (US-041) | `error=queue_full`, `predictedWaitSeconds`, `depth`, `retryAfterSeconds` |

**Forbidden in logs/alerts:** filenames, extracted resume text, tokens/secrets, request bodies, raw URLs, document snapshots.

**Env (web / sweeper process):**

```
CLEANUP_BACKLOG_ALERT_SECONDS=300
ALERT_WORKER_CRASH_WINDOW_SECONDS=300
ALERT_WORKER_CRASH_THRESHOLD_COUNT=3
ALERT_CONVERSION_FAILED_WINDOW_SECONDS=300
ALERT_CONVERSION_FAILED_MIN_SAMPLES=5
ALERT_CONVERSION_FAILED_RATE_BPS=5000
ALERT_QUEUE_WAIT_SECONDS=15
```

**Ops wiring residual:** After ECS/CloudWatch exist, add metric filters on `$.message` for the alert names above and page on sustained fires. Until then, local/dev surfaces alerts as structured `console.warn` JSON only. Do not claim production monitoring is fully provisioned from this sketch.
