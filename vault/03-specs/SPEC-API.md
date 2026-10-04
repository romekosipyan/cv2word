---
type: spec
id: SPEC-API
tags:
  - spec
  - api
aliases:
  - SPEC-API
---

# SPEC-API — Job API

Owner role: [[Backend Developer]]. Review: [[Security Engineer]], [[Frontend Developer]].

## Purpose

Create conversion jobs, authorize private uploads, expose pollable status, stream downloads, and accept deletion. Conversion itself is out of process. See [[Architecture]] and [[Job State Machine]].

## Auth

Every job operation requires the job ID **and** an independent high-entropy secret issued at creation.

- Job ID alone never authorizes access.
- Secrets never appear in query strings, referrers, logs, or analytics.
- Prefer HttpOnly cookie or memory-held secret with CSRF protection for cookie-authenticated mutations.
- Origin checks on mutating routes.
- Downloads stream through the authenticated endpoint with `Cache-Control: no-store`.

## Routes

### `POST /api/jobs`

Create a job and short-lived upload authorization.

- Require idempotency key.
- Enforce one active job per anonymous session.
- Enforce proposed free quota: 3 jobs / 24 hours / session (assumption until product confirms).
- Return `201` with job id, upload instructions, and expiry. Do not echo the raw secret in logs.

### `POST /api/jobs/{id}/complete-upload`

Mark upload finished and enqueue if the object exists and passes server validation.

- Repeat calls are idempotent. Only one logical job completes. Quota counted once.
- Reject wrong type, too large, too many pages, encrypted, corrupt, zero-page, or image-only before queueing.

### `GET /api/jobs/{id}`

Return state, named stage, sanitized error code, warnings, expiry, and whether download is available. Never return extracted text or object bytes.

Bounded polling with backoff. Clients must not spin.

### `GET /api/jobs/{id}/download`

Stream `resume-editable.docx` only when state is `succeeded` and access is unexpired. `404`/`403` for missing, unauthorized, expired, or failed jobs must be neutral and must not disclose another user's job.

### `DELETE /api/jobs/{id}`

Revoke access immediately. Return `202` while cleanup is in progress. Do not report `deleted` until verification. See [[SPEC-STORAGE]].

## Error contract

Return stable sanitized codes: `unsupported_type`, `too_large`, `too_many_pages`, `encrypted`, `corrupt`, `scan_detected`, `queue_full`, `rate_limited`, `conversion_failed`, `output_invalid`, `expired`, `unauthorized`, `delete_pending`.

Do not expose parser details.

## Capacity

Reject new jobs with a retry message when capacity cannot meet a bounded queue wait of two minutes.

## Non-functional assumptions

99.5% monthly availability for upload/status/download API. Measure independently of conversion latency. See [[Reliability Targets]].
