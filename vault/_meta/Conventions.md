---
type: meta
tags:
  - meta
  - conventions
aliases:
  - Conventions
---

# Vault conventions

## Note types

| `type` | Folder | Meaning |
|---|---|---|
| `moc` | various | Map of content |
| `product` | `01-product/` | Product contract |
| `architecture` | `02-architecture/` | System design |
| `spec` | `03-specs/` | Implementable specification |
| `epic` | `04-stories/` | Story grouping |
| `story` | `04-stories/` | Kanban work item |
| `plan` | `05-implementation/` | Delivery sequence |
| `quality` | `06-quality/` | Fidelity, QA, acceptance |
| `security` | `07-security/` | Privacy, isolation, deletion |
| `growth` | `08-seo/` | SEO, content, analytics |
| `decision` | `09-decisions/` | ADR |
| `role` | `10-roles/` | Agent role |
| `template` | `templates/` | New-note template |
| `board` | `board/` | Kanban |

## Wikilinks

Use `[[Note Name]]` for every dependency. A story must link its epic, spec, requirement, role, and plan week. Do not leave orphan notes.

## Story status

`backlog` → `spec-ready` → `ready` → `in-progress` → `in-review` → `qa` → `done`

`blocked` is orthogonal. If blocked, keep the previous status in `blocked_from` and explain `blocked_reason`.

## IDs

- Requirements: `R01`–`R12` from [[MVP Priorities]]
- Epics: `E01`–`E10`
- Stories: `US-001`+
- Specs: `SPEC-API`, `SPEC-WORKER`, `SPEC-STORAGE`, `SPEC-UI`, `SPEC-FIDELITY`, `SPEC-SEO`, `SPEC-EVENTS`, `SPEC-A11Y`, `SPEC-SECURITY`
- Decisions: `ADR-001`+

## Claims

Numerical targets in the PRD are planning assumptions unless a decision note marks them verified. Public copy must stay inside [[Claims and Non Goals]].
