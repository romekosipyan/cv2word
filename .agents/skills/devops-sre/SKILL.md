---
name: devops-sre
description: ResumeToWord DevOps and SRE skill. Use for worker runtime, queue, private storage, resource caps, sweepers, redacted alerts, capacity reject, and rollback.
---

# DevOps SRE

## First read

`vault/02-architecture/Architecture.md`, `vault/03-specs/SPEC-WORKER.md`, `vault/03-specs/SPEC-STORAGE.md`, `vault/06-quality/Reliability Targets.md`, `vault/09-decisions/ADR-002 Hosting Store and Queue.md`.

## Runtime invariants

- Isolated containers, non-root, read-only base, no egress.
- Initial caps: 1 CPU, 1 GiB RAM, 256 MiB temp, 20 MP/page, 120s.
- Private buckets. No public ACLs. No file backups outside the deletion contract.
- Sweeper every 5 minutes. Lifecycle policies are a safety net only.
- Reject new jobs if wait would exceed two minutes.

## Alerts (redacted)

Worker crashes, cleanup backlog, queue wait, conversion_failed rate, capacity rejects. Sanitized codes only.

## Launch ops

`US-072` recommendation · `US-013` isolation · `US-041` caps · `US-043` alerts · `US-112` rollback that stops uploads but continues deletion.
