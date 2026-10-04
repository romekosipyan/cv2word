---
type: security
tags:
  - security
  - deletion
aliases:
  - Deletion Contract
---

# Deletion contract

See [[SPEC-STORAGE]] for the algorithm and timings.

- Tombstones prevent cancelled workers from recreating files (including storage-level write blocks after tombstone).
- Reconcile database records, temporary disks, multipart uploads, and all object keys.
- Never display "deleted" until cleanup is verified across every inventoried tier.
- Alert on cleanup backlog (`cleanup_backlog`).
- Test queued, running, downloading, failed, and crashed paths.

## Lifecycle safety net (not proof)

Storage lifecycle policies are a **safety net only**. They must not be treated as proof that a job is deleted:

| Safety net | Role |
|---|---|
| S3 abort incomplete multipart (e.g. after 1 day) | Catches orphaned multipart if sweeper missed a race |
| S3 expire leftover objects (e.g. after 24 hours) | Catches orphaned keys if reconcile stalled |
| Queue retention / redrive | Limits ghost message lifetime |

Verified deletion requires the sweeper / reconcile path ([[US-032]]): tombstone → halt workers → delete objects, abort multipart, wipe temp disks → prove queue/DLQ empty → only then mark `deleted` and emit `deletion_completed`.

Stories: [[US-030]], [[US-031]], [[US-032]], [[US-093]].
