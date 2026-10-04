---
type: spec
id: SPEC-STORAGE
tags:
  - spec
  - storage
aliases:
  - SPEC-STORAGE
---

# SPEC-STORAGE — Objects, expiry, deletion

Owner role: [[Backend Developer]], [[DevOps SRE]]. Verification: [[Security Engineer]].

## Objects

Private buckets for original PDF, output DOCX, and any later derivatives. No public ACLs, no CDN cache, `X-Robots-Tag: noindex, nofollow, noarchive` on file routes. File routes excluded from sitemap and indexing.

No file backups, replication copies, or storage versions outside the deletion contract. Inventory every storage tier.

## Retention

| Data | Policy |
|---|---|
| Original, DOCX, previews, OCR derivatives | Expire access 60 minutes after upload completes, or 60 minutes after job creation for abandoned uploads |
| User deletion or cancellation | Revoke immediately; target verified physical cleanup within 5 minutes |
| Automatic cleanup | Sweep every 5 minutes; target physical removal within 15 minutes of expiry |
| Failed job artifacts | Remove within 5 minutes of terminal failure |
| Job metadata | Redacted operational metadata 7 days; analytics aggregates up to 90 days |

These are proposed service levels to verify in [[US-032]] and [[US-093]].

## Deletion algorithm

1. Write tombstone and revoke access.
2. Stop processing; worker must observe tombstone and halt.
3. Delete object keys, multipart uploads, temp disks.
4. Reconcile DB record, queue message, and all inventoried tiers.
5. Only then mark `deleted` and emit `deletion_completed`.

Storage lifecycle policies are a safety net, not proof of deletion.

## Test matrix

Deletion while queued, running, downloading, failed, and crashed. Alert on cleanup backlog. See [[Deletion Contract]].
