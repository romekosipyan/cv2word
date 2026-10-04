---
type: decision
id: ADR-002
status: recommended
tags:
  - adr
aliases:
  - ADR-002 Hosting Store and Queue
---

# ADR-002 Hosting, store, and queue

## Status

recommended — Week 2 may design against this stack. **Not accepted.** A human must still approve cloud spend and the processor identity that will appear on the privacy notice. Do not provision production accounts from this note.

Recommendation recorded [[US-072]] (2026-10-03). Cost figures are **planning assumptions**, not quotes or commitments. See [[Claims and Non Goals]].

## Context

P0 needs private object storage, a small relational database for opaque job metadata only, a queue with leases and retries, and isolated conversion containers. Conversion never runs in a Next.js request handler. Workers must be non-root, read-only base, no egress, with initial caps of 1 CPU, 1 GiB RAM, 256 MiB temp, 20 MP/page, and 120s. A sweeper runs every 5 minutes. New jobs are rejected if predicted queue wait would exceed 2 minutes. File backups, versions, and replicas outside the [[Deletion Contract]] are forbidden. Lifecycle policies are a safety net, not proof of deletion.

Region is a separate decision: [[ADR-001 Processing Region]]. PyMuPDF AGPL vs commercial is out of scope: [[ADR-003 PyMuPDF License]].

## Options compared

All three are single-cloud and can host the web app, DB, queue, object store, and workers in one EU region. Hybrid (for example a CDN edge plus another cloud for workers) was set aside: it adds a second processor and a replatform risk before Week 2.

### Option A — AWS in `eu-central-1` (Frankfurt)

| Piece | Product |
|---|---|
| Object store | S3, Block Public Access, ACLs disabled, versioning off, no replication, no AWS Backup on file buckets |
| Relational DB | RDS PostgreSQL `db.t4g.micro` (single-AZ for P0), metadata only, 7-day automated backups of **rows**, not files |
| Queue | SQS standard + DLQ (visibility timeout = lease; one infra retry then DLQ) |
| Convert workers | ECS on Fargate, private subnets, **no NAT**, no public IP |
| Web / job API | ECS on Fargate behind an internal-or-public ALB (public HTTPS only for the site) |
| Sweeper | EventBridge Scheduler every 5 minutes → short Fargate task |
| Secrets | Secrets Manager; never in URLs or task command lines |

**Why it fits.** S3 versioning and S3 soft-delete are off unless someone turns them on, which is the safest default for the deletion contract. SQS visibility timeouts are native leases without an always-on Redis bill. Gateway VPC endpoints keep S3 traffic on the AWS network. A worker subnet with no NAT and security-group egress limited to VPC endpoint prefix lists is a well-known no-egress pattern.

**Constraints to enforce in [[US-013]] / [[US-041]], not here.** Fargate requires 2 GiB when requesting 1 vCPU; provision 1 vCPU / 2 GiB and cgroup-cap RSS to 1 GiB. Fargate default ephemeral disk is 20 GiB; do not use it for job files — mount a 256 MiB `tmpfs` and `readonlyRootFilesystem`. Prefer Linux/x86 until the [[US-070]] spike proves ARM wheels for the pinned engine.

### Option B — Azure West Europe (Netherlands)

| Piece | Product |
|---|---|
| Object store | Blob Storage, public access disabled, **soft delete and versioning turned off** |
| Relational DB | Azure Database for PostgreSQL Flexible Server, burstable |
| Queue | Azure Cache for Redis (leases) or Service Bus (peek-lock) |
| Convert workers | Container Apps Jobs or AKS, VNet + deny-all UDR, no egress |
| Sweeper | Container Apps Job on a 5-minute schedule |

**Viable, not preferred.** Soft delete is on by default for blobs and would retain file copies outside the deletion contract unless explicitly disabled. Consumption Container Apps bill active vCPU higher than Fargate for always-on capacity. No-egress needs VNet integration plus a blackhole route; easier to get wrong than “no NAT + endpoint-only SGs.”

### Option C — GCP `europe-west4` (Netherlands)

| Piece | Product |
|---|---|
| Object store | GCS, public access prevention, **object versioning and soft delete turned off** |
| Relational DB | Cloud SQL PostgreSQL, small shared-core |
| Queue | Memorystore for Redis (leases) or Pub/Sub (weaker lease story) |
| Convert workers | Cloud Run Jobs or GKE, Direct VPC egress, Cloud NAT **absent**, VPC firewall deny-egress |
| Sweeper | Cloud Scheduler every 5 minutes → Cloud Run Job |

**Viable, not preferred.** GCS soft delete is on by default (multi-day retain). Cloud Run’s default path has egress unless Direct VPC + no NAT is applied. Pub/Sub is a poorer lease/retry match than SQS; Redis adds a fixed bill. Isolation is achievable, but Week 2 would spend more time fighting defaults.

## Recommendation

**Option A: AWS, single region `eu-central-1`, ECS/Fargate + S3 + RDS PostgreSQL + SQS.**

Week 2 stories ([[US-003]], [[US-012]], [[US-013]], [[US-030]], [[US-041]]) can start against this shape without replatforming. Do not introduce Kubernetes, Redis, or a second cloud in P0 unless a later ADR records why.

## Cost assumption (not a commitment)

Planning assumption for **sustained 10 concurrent convert jobs** (10 always-reachable workers), public list-price order of magnitude, USD, researched 2026-10-03. Not a quote, reserved-instance, or savings-plan figure. EU list prices move; re-estimate before any spend approval.

| Piece | Planning assumption |
|---|---|
| 10 convert tasks (Fargate 1 vCPU / 2 GiB, x86) | ~$400–430 |
| Next.js web, 2 tasks (0.5 vCPU / 1 GiB) + ALB | ~$60–70 |
| RDS PostgreSQL `db.t4g.micro` + 20 GiB | ~$16–20 |
| SQS + DLQ | <$2 |
| S3 (short-lived objects, private) | ~$2–5 |
| Interface VPC endpoints (ECR, logs, secrets, SQS); S3 gateway is free | ~$35–45 |
| CloudWatch (redacted) + Secrets Manager | ~$15–25 |
| 5-minute sweeper | ~$2–5 |
| **Headline total** | **~$550 / month** |

**Range: about $530–600 / month** at that capacity. No NAT Gateway is both an isolation control and a cost avoidance (NAT would add a large, avoidable bill and a path to the internet).

If traffic is far below 10 concurrent jobs, keep 2 warm workers and scale to 10; the same stack still applies, and the monthly compute line falls. Do not treat a quieter month as a new architecture.

Option B at the same 10-worker capacity is roughly **$750–850 / month**. Option C is roughly **$600–680 / month**. Neither alternative is cheaper, and both have worse deletion defaults.

## How isolation, privacy, and deletion are enforced

These are product controls, **not a claim of legal compliance**.

### No-egress workers

- Convert tasks run in private subnets with `assignPublicIp: DISABLED` and **no NAT Gateway**.
- Security group egress allowlist is VPC endpoint prefix lists (S3 gateway, ECR pull, CloudWatch Logs, Secrets Manager, SQS) plus the RDS instance security group. SQL traffic uses the instance private IP, not an RDS API endpoint.
- Task definition: non-root user, `readonlyRootFilesystem: true`, 256 MiB `tmpfs` for the per-job temp dir, 120s stop timeout, CPU/memory reservation plus cgroup 1 GiB cap.
- Image pull uses ECR via a VPC endpoint. Workers never receive a default route to `0.0.0.0/0`.
- Workers must not be given credentials that can call the public internet APIs. Job messages carry job references only — never file bytes or bearer secrets. See [[SPEC-WORKER]].

### Private buckets

- Two private buckets (or two prefixes with separate IAM): originals and outputs. Optional later P1 derivatives stay out of P0.
- Account-level and bucket-level **S3 Block Public Access**. ACLs disabled (`BucketOwnerEnforced`). No CloudFront/CDN in front of file objects. File routes stay `noindex` / `no-store` on the app. See [[SPEC-STORAGE]].
- Uploads use short-lived, prefix-scoped presigned PUT from the job API. Downloads stream through the authenticated job API, never a public object URL.
- Encryption at rest (SSE-S3 or SSE-KMS). TLS in transit. Least-privilege task roles: workers get `Get`/`Put`/`Delete` on job-key prefixes only.

### No file backups outside the deletion contract

Inventory every tier that can hold file bytes (required by [[SPEC-STORAGE]]):

1. S3 original objects
2. S3 output objects
3. Incomplete multipart uploads
4. Worker `tmpfs`
5. In-flight SQS payloads (references only — never document content)
6. RDS rows (opaque metadata only; never extracted text)
7. Logs and traces (redacted codes and opaque IDs only)

**Disabled on file buckets:** versioning, MFA-delete copies, replication, Object Lock, S3 Inventory export of object bytes, AWS Backup, CRR/SRR. RDS automated backups cover metadata rows for the 7-day operational window only.

### Sweeper every 5 minutes

- EventBridge rule `rate(5 minutes)` starts a least-privilege sweeper task.
- Algorithm stays [[SPEC-STORAGE]]: tombstone and revoke → halt workers → delete objects, multipart uploads, and temp disks → reconcile DB and queue → only then `deleted`.
- S3 lifecycle (abort incomplete multipart after 1 day; expire leftover objects after 24 hours) is a **safety net only**. Alerts fire on cleanup backlog. Never display `deleted` until reconcile succeeds. See [[Deletion Contract]] and [[US-030]].

### Capacity reject (2-minute wait)

- Job API computes `predicted_wait ≈ (queued + in_flight) × p50_job_seconds / max(ready_workers, 1)`.
- If `predicted_wait > 120`, reject with sanitized `queue_full`. Do not enqueue.
- SQS `ApproximateNumberOfMessages` + `ApproximateNumberOfMessagesNotVisible` plus the ECS desired/running convert count are enough. No Redis required in P0. See [[Reliability Targets]] and [[US-041]].

### Redacted alerts

Worker crashes, cleanup backlog, queue wait, `conversion_failed` rate, and capacity rejects. Sanitized codes and opaque job IDs only. No filenames, resume text, tokens, or document snapshots. See [[SPEC-EVENTS]] and [[US-043]].

## Follow-on stories (do not start from this spike)

| Story | Uses this ADR |
|---|---|
| [[US-013]] Isolated conversion workers | Task definition, no-egress VPC, tmpfs, non-root |
| [[US-012]] Queue leases and retries | SQS visibility, DLQ, one infra retry |
| [[US-030]] Automatic expiry sweeper | 5-minute schedule and reconcile |
| [[US-041]] Capacity reject and resource caps | 2-minute reject, 1 CPU / 1 GiB / 256 MiB / 20 MP / 120s |
| [[US-111]] Privacy notices and processors | Name AWS and `eu-central-1` only after human approval |

## Decision

Recommend Option A. Leave this ADR **recommended** until a human accepts spend and processor listing. Sketch of service and env names: `infra/README.md`.
