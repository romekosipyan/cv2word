---
type: plan
tags:
  - plan
  - launch
aliases:
  - Launch Review Checklist
---

# Launch review checklist

Record approver, date, evidence link, and any accepted exception. Exceptions require a revised contract. Product owns final go/no-go.

| Role | Gate |
|---|---|
| Product | Supported audience, file limits, fidelity copy, non-goals, launch scope approved |
| Engineering | Pinned dependencies, license route, worker limits, queue recovery, cost monitoring |
| QA | Baseline and held-out corpus results; editable output; editor matrix |
| Security/privacy | Isolation, access expiry, derivative deletion, redacted logs, processors, public notices |
| Design | Mobile and accessible success, failure, cancellation, expiry, deletion |
| Growth | Indexable original content, canonical/sitemap, privacy-safe events, research backlog |
| Operations | Alert routing, cleanup backlog recovery, support intake, feature shutdown rehearsal — see [[Rollback and ops runbook]] / [[US-112]] |

## Hard blockers

- Unresolved [[ADR-003 PyMuPDF License]]
- Cross-job access
- Unverifiable deletion
- Empty outputs marked successful
- Baseline [[SPEC-FIDELITY]] failure
- Missing processor/region notice before uploads

OCR, extra languages, and paid plans may remain unshipped without blocking P0.
