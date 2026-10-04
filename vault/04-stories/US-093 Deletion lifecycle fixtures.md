---
type: story
id: US-093
title: Deletion lifecycle fixtures
status: in-review
priority: P0
epic: "[[E08 Release Verification]]"
requirement: R05
spec: "[[SPEC-STORAGE]]"
assignee_role: security-engineer
plan_week: week-4
estimate: M
depends_on: ['US-032']
tags:
  - story
  - p0
  - security
aliases:
  - US-093
---

# US-093 Deletion lifecycle fixtures

As security, I want deletion fixtures for queued, running, downloading, failed, and crashed jobs so cleanup is verifiable.

## Links

- Epic: [[E08 Release Verification]]
- Requirement: R05 in [[MVP Priorities]]
- Spec: [[SPEC-STORAGE]]
- Role: `security-engineer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-4
- Depends on: [[US-032]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Each lifecycle fixture reaches verified deletion within the tested target.
- [x] No result is republished after delete during processing.
- [x] Cleanup backlog alert is exercised.

## Implementation notes

[[Acceptance Criteria]] item 4.

Implemented under `apps/web`:
- Lifecycle fixture seeder: `tests/helpers/deletion-lifecycle-fixtures.ts` — queued / running / downloading / failed / crashed with objects, prefix orphans, multipart, temp disk, queue refs.
- Tests: `tests/deletion-lifecycle.test.ts` — matrix delete→reconcile within `USER_DELETE_VERIFIED_TARGET_SECONDS` (300); running delete blocks publish/`putObject`/sim worker success; downloading delete revokes bytes; `cleanup_backlog` when stalled past target.
- Prefix orphan inventory (deferred from [[US-032]]): `ObjectStorage.listObjectKeysForJob` + filesystem walk of `originals|outputs/{jobId}/`; `verifyDeletionTiers` / `purgePhysicalTiers` fail closed if missing or orphans remain.

Kanban not edited (orchestrator parallel-lane instruction).

## Evidence

- Reviewer: pending code-reviewer / security re-review
- Tests / fixtures: `cd apps/web && npm test -- tests/deletion-lifecycle.test.ts tests/deletion-reconciliation.test.ts tests/user-delete-cancel.test.ts` → **31/31 passed** (2026-10-04). US-093 suite alone **12/12**.
- Claim check against [[Claims and Non Goals]]: no layout/ATS/OCR/demand claims; no resume text in logs/alerts; lifecycle still documented as safety net only.
- Program AC item 4: delete during processing → access revoked, no republish, derivatives cleared within tested 5-minute target (wall-clock reconcile asserted `< 300s`).
