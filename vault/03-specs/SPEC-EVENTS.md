---
type: spec
id: SPEC-EVENTS
tags:
  - spec
  - analytics
aliases:
  - SPEC-EVENTS
---

# SPEC-EVENTS — Privacy-safe telemetry

Owner role: [[Growth SEO]], [[Backend Developer]]. Privacy review: [[Security Engineer]].

## Allowed events

`landing_view`, `file_selected`, `validation_failed`, `upload_completed`, `job_queued`, `conversion_started`, `conversion_failed`, `output_ready`, `download_requested`, `delete_requested`, `deletion_completed`, optional `quality_feedback`.

## Essential-only subset (ADR-008 open)

While [[ADR-008 Consent and Legal Basis]] is open, emit only:

`file_selected`, `validation_failed`, `upload_completed`, `job_queued`, `conversion_started`, `conversion_failed`, `output_ready`, `download_requested`, `delete_requested`, `deletion_completed`.

Capacity, quota, and IP rate rejects map to `validation_failed` with catalog codes `queue_full` or `rate_limited`. Do not emit `landing_view`, `quality_feedback`, consented acquisition attributes, or non-essential marketing tags on converter screens until the ADR is decided.

Implementation allowlist: `apps/web/src/lib/events/catalog.ts`.

## Allowed properties

Layout/size/page buckets, sanitized error code, duration, engine version, opaque job id, lifecycle state/reason. Consented acquisition attributes are gated by ADR-008 (disabled while open).

## Forbidden

Filename, resume text, tokens, contact details, raw full URL, document snapshots, job secrets.

## Rules

- Operational job events use opaque IDs for short-term deduplication, then aggregate.
- Marketing measurement follows the applicable consent decision. Essential service telemetry needs a documented basis.
- Separate upload rejection, supported-file conversion success, download request, and user-reported editing success.
- Keep ads off upload/result screens during MVP.

## Proposed decision metrics

| Metric | Proposed rule |
|---|---|
| Supported conversion success | ≥95% of valid text-PDF jobs produce validated output in beta; infra failures stay in the denominator |
| User utility | ≥70% of 20 observed target users can make a meaningful edit within 5 minutes without retyping most content |
| Download request rate | Track output-ready → download; baseline before a growth target |
| Cost and margin | Track compute, storage, egress, licensing, support, payment |
| Privacy operations | No cross-job access; deletion targets met for all lifecycle fixtures |
