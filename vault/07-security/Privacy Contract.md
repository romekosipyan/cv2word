---
type: security
tags:
  - security
  - privacy
aliases:
  - Privacy Contract
---

# Privacy contract

Process files solely to perform the requested conversion. Do not use resume contents for training, profiling, advertising, or SEO. Do not share files with external AI or OCR providers in P0.

Publish processor identities, processing region, retention policy, and contact route **before** collecting uploads.

These are proposed product controls, not a claim of legal compliance. Jurisdiction, processor contracts, consent, and user-rights review must complete before public launch.

## Access and transport

TLS, encryption at rest, private buckets, least privilege, secrets management. Job ID is not authorization. HttpOnly session protection where feasible. CSRF for cookie mutations. No secrets in query strings or referrers.

## Logging

Redact names, original filenames, extracted text, tokens, document snapshots, and request bodies. Disable session replay on conversion screens.

## Related

[[Deletion Contract]] · [[SPEC-EVENTS]] · [[SPEC-SECURITY]]
