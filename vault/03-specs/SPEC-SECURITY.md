---
type: spec
id: SPEC-SECURITY
tags:
  - spec
  - security
aliases:
  - SPEC-SECURITY
---

# SPEC-SECURITY — Access, isolation, abuse

Owner role: [[Security Engineer]]. Implements [[Privacy Contract]] and [[Threat Model]].

## Access

- TLS in transit, encryption at rest, private buckets, least-privilege roles, secrets manager.
- Job ID is not a capability. Secret required on every operation.
- No secrets in query strings or referrers.
- CSRF + origin checks for cookie mutations.
- Authorized download endpoint only. `Cache-Control: no-store`.
- Exclude file routes from indexing.

## Processing boundaries

- Process files solely to convert. No training, profiling, advertising, or SEO use of resume contents.
- No sharing with external AI or OCR providers in P0.
- Workers: no outbound network, no root, no fetching PDF URLs.
- Link scheme allowlist only.

## Abuse

- Byte and page limits enforced server-side.
- One active job per session.
- Proposed 3 jobs / 24h / session.
- Rate limits on create, poll, and download.
- Reject when queue wait would exceed two minutes.
- Worker CPU/RAM/disk/time/raster caps. See [[SPEC-WORKER]].

## Redaction

Logs and error reports contain no names, original filenames, extracted text, tokens, document snapshots, or request bodies. Disable session replay on conversion screens. Operational events use opaque IDs, then aggregate.

## Launch blockers

Cross-job access, unverifiable deletion, unresolved licensing. See [[Launch Review Checklist]].
