---
type: architecture
tags:
  - architecture
  - jobs
aliases:
  - Job State Machine
---

# Job state machine

Canonical states from [[Architecture]] and [[SPEC-API]].

```mermaid
stateDiagram-v2
    [*] --> created
    created --> uploading: upload authorized
    created --> deleting: cancel or expire abandoned
    uploading --> queued: complete-upload
    uploading --> failed: invalid file
    uploading --> deleting: cancel
    queued --> processing: worker lease
    queued --> deleting: cancel or expire
    processing --> validating: conversion finished
    processing --> failed: crash or timeout after retry
    processing --> deleting: tombstone seen
    validating --> succeeded: editable text + package OK
    validating --> failed: empty, omitted page, invalid package
    succeeded --> deleting: user delete or expiry
    failed --> deleting: cleanup
    cancelled --> deleting: cancel requested
    deleting --> deleted: verified cleanup
```

## Rules

- Only a worker with a live lease may move `queued` → `processing` → `validating` → terminal success/failure.
- A tombstone wins. A worker that sees a tombstone must stop and not write outputs.
- `deleted` is shown to the user only after cleanup verification. See [[Deletion Contract]].
- Expired access returns a neutral unavailable result even if metadata still exists for the 7-day redacted retention window.
- Quota is counted once per logical job, including retries and repeated complete-upload calls.
