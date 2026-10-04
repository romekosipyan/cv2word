# Backend reference

## State machine

`created` → `uploading` → `queued` → `processing` → `validating` → `succeeded` | `failed`

Cancel → `cancelled`. Terminal jobs → `deleting` → `deleted`. Expiry is an access condition.

Workers publish only with a live lease and no tombstone.

## Validation order

1. Signature and parseability
2. Size ≤ 10 MiB, pages 1–5
3. Encryption / corruption
4. Per-page text density
5. Convert
6. Native text present, no omitted pages, package safe, metadata stripped

## Deletion

1. Tombstone + revoke
2. Stop worker
3. Delete objects, multipart, temp
4. Reconcile every inventoried tier
5. Emit `deletion_completed` only after verification

## Limits to enforce server-side

10 MiB · 1–5 pages · one active job / session · configurable 3/24h quota · 120s worker · 1 CPU / 1 GiB / 256 MiB temp / 20 MP raster (confirm in tests)
