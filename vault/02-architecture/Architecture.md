---
type: architecture
tags:
  - architecture
aliases:
  - Architecture
---

# Architecture

Next.js serves indexable marketing/support pages and the upload UI. A server-side API creates jobs and short-lived upload authorization. Private object storage holds originals and outputs. A queue dispatches work to isolated Python containers. PyMuPDF inspects PDFs. pdf2docx reconstructs DOCX. A validation stage checks text, package structure, and omissions before the result becomes available.

Conversion never runs inside Next.js request handlers or serverless execution budgets.

## Planned repo layout

```
apps/web/                 Next.js App Router: pages, converter UI, job API
workers/convert/          Isolated Python worker image
infra/                    Queue, object store, worker runtime, alerts
vault/                    This knowledge graph
```

## Runtime pieces

| Piece | Responsibility | Notes |
|---|---|---|
| Next.js web | SSR marketing, converter UI, job API | Progressive load of converter code |
| Relational DB | Opaque job metadata only | Never store extracted resume text |
| Object store | Original PDF, output DOCX, optional P1 derivatives | Private buckets, no public ACLs |
| Queue | Bounded dispatch, leases, retries | SQS + DLQ; no Redis in P0 |
| Convert worker | Inspect, convert, validate, publish | Non-root, no outbound network |
| Sweeper | Expiry and verified deletion | Every 5 minutes |

## Job states

`created` → `uploading` → `queued` → `processing` → `validating` → `succeeded` | `failed`

Cancellation leads to `cancelled`. All terminal jobs proceed through `deleting` → `deleted`. Expired access is a separate access condition, not a job state rewrite that hides history.

Workers publish state only while holding a current lease and while no deletion tombstone exists.

## Proposed routes

See [[SPEC-API]].

- `POST /api/jobs`
- `POST /api/jobs/{id}/complete-upload`
- `GET /api/jobs/{id}`
- `GET /api/jobs/{id}/download`
- `DELETE /api/jobs/{id}`

Authenticate every job operation with an independent high-entropy secret. Idempotency keys for job creation. Bounded polling with backoff. `202` for pending deletion.

## Worker isolation

Non-root, read-only base image, per-job temp dir, no outbound network, CPU/memory caps, parser timeouts, temp disk quota. Initial caps to test: 1 CPU, 1 GiB RAM, 256 MiB temp disk, 20 megapixels per rasterized page. Retry once only for infrastructure failures. Prevent duplicate output writes.

## Data stored

Opaque job ID, token hash, state, size/page buckets, engine version, timestamps, expiry, sanitized error code, object keys. Queue messages carry job references, never document content or bearer credentials.

## Hosting recommendation

[[ADR-002 Hosting Store and Queue]] recommends AWS in a single EU region: S3 (private, no file versions), RDS PostgreSQL (opaque metadata only), SQS + DLQ, ECS on Fargate for web and isolated convert workers, EventBridge sweeper every 5 minutes. Status is **recommended**, not accepted — a human must still approve spend.

[[ADR-001 Processing Region]] proposes `eu-central-1` (Frankfurt). Launch country stays a human decision. Do not collect uploads until region, processors, and contact route are published.

## Dependencies

- pdf2docx + PyMuPDF + python-docx for reconstruction ([S1](https://pdf2docx.readthedocs.io/en/latest/))
- PyMuPDF licensing is AGPL or commercial — [[ADR-003 PyMuPDF License]] recommends commercial for proprietary SaaS (status `recommended`, `human_reviewer` TBD). Launch blocker: do not publish a worker image until a named human accepts the ADR
- P1 OCR would use Tesseract separately; PyMuPDF OCR extraction does not itself deliver a well-structured DOCX

## Related specs

[[SPEC-API]] · [[SPEC-WORKER]] · [[SPEC-STORAGE]] · [[SPEC-SECURITY]] · [[SPEC-EVENTS]]
