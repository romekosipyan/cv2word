---
type: security
tags:
  - security
  - threat-model
aliases:
  - Threat Model
---

# Threat model

Lightweight launch model. Security owns a full review before public MVP.

| Threat | Control |
|---|---|
| Guessable job ID access | High-entropy secret required; ID is not a capability |
| Token leakage via URL/referrer/analytics | Secrets only in cookie or non-logged header; `no-store`; redacted events |
| Cross-job download | Authz on every route; tests in [[US-091]] |
| Malicious PDF | Isolated worker, no outbound net, parser timeouts, raster caps, no URL fetch |
| Macro/active content in output | Strip and refuse macros |
| Resource exhaustion | Size/page/quota/rate/queue/runtime caps |
| Worker escape | Non-root, read-only image, temp disk quota, no network |
| Deleted file resurrection | Tombstones + reconciliation |
| Log leakage of resume text | Redaction policy; no request bodies |
| Indexing of user files | Private buckets, noindex, sitemap exclusions |
| Silent data use | Product ban on training/profiling/ads/SEO and external AI in P0 |
