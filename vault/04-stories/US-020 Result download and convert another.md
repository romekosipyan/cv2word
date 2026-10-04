---
type: story
id: US-020
title: Result download and convert another
status: in-review
priority: P0
epic: "[[E05 Converter UI]]"
requirement: R03
spec: "[[SPEC-UI]]"
assignee_role: frontend-developer
plan_week: week-3
estimate: M
depends_on: ['US-011', 'US-004']
tags:
  - story
  - p0
  - frontend
aliases:
  - US-020
---

# US-020 Result download and convert another

As a user, I want to download resume-editable.docx and convert another file so I can finish the job in Word.

## Links

- Epic: [[E05 Converter UI]]
- Requirement: R03 in [[MVP Priorities]]
- Spec: [[SPEC-UI]]
- Role: `frontend-developer` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-3
- Depends on: [[US-011]], [[US-004]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Succeeded jobs offer Download editable DOCX, expiry time, Delete my files, and Convert another resume.
- [x] Download streams through the authenticated endpoint and does not immediately delete the job.
- [x] Retries are allowed until expiry or user deletion.
- [x] UI does not treat download click as proof the user saved or opened the file.

## Implementation notes

Follow the linked spec. Do not paste resume contents into this note.

Ready-state UI replaces the US-004 stub: `ResultPanel` + `downloadJob` (Bearer `GET /api/jobs/{id}/download`) + blob trigger with filename `resume-editable.docx`. Download does not call delete. Post-click copy states the browser started a download and does not confirm save/open; Download remains available for retry. Delete my files reuses `DELETE` → `delete_pending` honesty. Convert another clears credentials and returns to idle. Quality-warning checklist deferred to [[US-022]] / [[US-060]] (fidelity warning still shown on result).

## Evidence

- Reviewer:
- Tests / fixtures (2026-10-04):
  - `apps/web/tests/converter-result.test.ts` — ready CTAs + fidelity warning; expiry label without secrets; no affirmative “saved/opened” claim; claim-safe copy; client `downloadJob` uses Bearer path (no query secrets); default filename `resume-editable.docx`.
  - Related green: `converter-stages` / `converter-failures` / `converter-messages`.
  - Command: `cd apps/web && npm test -- tests/converter-result.test.ts tests/converter-stages.test.ts tests/converter-failures.test.ts tests/converter-messages.test.ts` → **22/22 passed**.
  - Browser (`http://localhost:3000/`): same-tab resume of succeeded job → Ready panel with Download editable DOCX, Available until…, Delete my files, Convert another resume; fidelity warning present; URL stayed `/` (no job id/secret). Download → honesty note (“does not confirm… saved or opened”) + download re-enabled; API still `succeeded` / download `200` after click. Convert another → idle upload surface.
- Claim check against [[Claims and Non Goals]]:
  - Required fidelity warning on result.
  - Download request ≠ proof of save/edit.
  - No perfect layout / ATS / 100% / ranking claims.
  - No US-022 warning checklist expansion in this story.
