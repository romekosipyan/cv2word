---
type: story
id: US-032
title: Verified deletion reconciliation
status: done
priority: P0
epic: "[[E04 Privacy Deletion]]"
requirement: R05
spec: "[[SPEC-STORAGE]]"
assignee_role: security-engineer
plan_week: week-3
estimate: M
depends_on: ['US-031']
tags:
  - story
  - p0
  - security
aliases:
  - US-032
---

# US-032 Verified deletion reconciliation

As security, I want deletion to reconcile every storage tier so cancelled workers cannot recreate files.

## Links

- Epic: [[E04 Privacy Deletion]]
- Requirement: R05 in [[MVP Priorities]]
- Spec: [[SPEC-STORAGE]]
- Role: `security-engineer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-031]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Tombstones prevent output recreation after cancel.
- [x] DB rows, object keys, multipart uploads, temp disks, and queue payloads are reconciled before deleted is emitted.
- [x] Lifecycle policies are documented as a safety net, not as proof.
- [x] Cleanup backlog alerts exist.

## Implementation notes

[[Deletion Contract]].

Implemented under `apps/web`:
- Multi-tier proof: `deletion-reconcile.ts` (`verifyDeletionTiers` / `purgePhysicalTiers`) — DB access revoke, object keys, multipart, temp disks, live queue + DLQ. `deleted` + `deletion_completed` only when all tiers clean; incomplete → `job_deletion_cleanup_incomplete` and stay `deleting`.
- **Fail-closed inventory:** missing `listIncompleteMultipartForJob` / `tempDiskExists` marks those tiers unclean (`inventory_unimplemented`); missing `abortMultipartUploadsForJob` / `wipeTempDiskForJob` throws so purge cannot no-op into `deleted`. Required on `ObjectStorage`.
- Storage: filesystem adapter multipart inventory + abort, per-job temp disk wipe, `putObject` + `registerMultipartUpload` fail-closed with `tombstone_blocks_write`.
- Queue: `purge-contract.ts` documents production SQS filter+DeleteMessage semantics; retention/lifecycle are safety nets only.
- Alerts: `cleanup_backlog` when pending deletion exceeds `CLEANUP_BACKLOG_ALERT_SECONDS` (default 300).
- Lifecycle safety net spelled out in [[Deletion Contract]] (not proof).
- Object proof remains DB-recorded key pair only; prefix orphan inventory deferred to [[US-093]].

## Evidence

- Prior review: **code-reviewer** — **FAIL** (2026-10-03). Critical: optional inventory (`?.() ?? []` / `?? false`) treated missing multipart/temp APIs as clean (empty success / unverifiable deletion).
- **Fix (security-engineer, 2026-10-03):** Inventoried tiers fail closed when unimplemented; purge throws on missing abort/wipe; sweeper catches `inventory_unimplemented*` and stays `deleting`. Multipart register now tombstone-blocked. No claim of object-prefix inventory completeness (US-093).
- **Re-review: code-reviewer — PASS** (2026-10-03). Prior Critical cleared: missing `listIncompleteMultipartForJob` / `tempDiskExists` → unclean (`inventory_unimplemented`); missing abort/wipe → purge throws; sweeper never emits `deleted` / `deletion_completed` until `verifyDeletionTiers` passes; lifecycle documented as safety net only; logs omit secrets/resume text. Tombstone blocks `putObject` + `registerMultipartUpload`.
- Tests (re-review): `cd apps/web && npm test -- tests/deletion-reconciliation.test.ts` → **11/11 passed**.
- Claim check against [[Claims and Non Goals]]: no layout/ATS/OCR/demand claims introduced.
- Residual warnings (not Critical): object proof is DB key pair only — broaden under [[US-093]]; Deletion Contract matrix breadth → [[US-093]]; production SQS must honor `purge-contract.ts` ([[US-072]]). Sweeper incomplete-log on purge throw hardcodes both multipart+temp remaining (still fail-closed). Do not start [[US-010]] (ADR-003 blocked).
- `status: in-review` retained. **Ready for Done** — orchestrator may close without separate QA (security-built + code-review PASS). Kanban not edited by code-reviewer.
