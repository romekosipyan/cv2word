---
type: meta
tags:
  - meta
  - sdlc
aliases:
  - SDLC Operating Model
---

# Agentic SDLC operating model

Agents execute stories from [[SDLC Kanban]] using this vault as the knowledge graph. Humans own go/no-go, license, privacy, and public claims.

## Roles

See [[Role Roster]]. Every in-progress card has exactly one `assignee_role`. Review roles are a later status on that card, not silent coding on someone else's card.

## Parallel WIP (agentic team size)

Orchestrator may run **multiple In Progress cards at once** when dependencies allow. Prefer different roles; same role may run two cards if file ownership does not collide.

| Lane type | Typical roles | Rule |
|---|---|---|
| Build | backend, frontend, devops, growth, ux | One builder agent per card |
| Verify | security, qa | May run in parallel with unrelated build cards |
| Decision | product-owner, tech-lead | Close open ADRs that unblock later stories |
| Release | release-manager | Runbooks / signoff when deps met |

**Soft WIP target:** 4–6 In Progress P0 cards when the board has that many unblocked. Do not start P1. Do not start a card whose `depends_on` is not `done`. Prefer non-overlapping trees (e.g. worker convert vs deletion fixtures vs ops runbook).

When two agents would edit the same hot path (`apps/web` Job API core, converter UI shell, `deletion-reconcile`), serialize those cards.

## Workflow

1. **Orchestrator** selects all unblocked ready P0 stories (not only one) from [[Implementation Plan]] dependency order and assigns parallel lanes.
2. **Product owner** confirms stories are `spec-ready` and acceptance criteria are testable; closes product ADRs that gate launch stories.
3. **Tech lead** confirms linked specs and any open [[Decisions MOC]] that would block coding.
4. **Builder role** moves its card to `in-progress`, implements, and writes evidence on the story.
5. **Code reviewer** records findings while status is `in-review`.
6. **QA** and **security** run the story's verification hooks, then move to `qa` or back to `in-progress`.
7. **Release manager** accepts `done` only when story evidence, tests, and claim safety are attached.

## Definition of ready

- Story has ID, priority, epic, spec, role, and testable acceptance criteria.
- Linked spec exists and does not contradict [[PRD Contract]].
- Blocking ADRs are either decided or explicitly out of scope for this story.
- Card is in **Ready** on [[SDLC Kanban]].

## Definition of done

- Acceptance criteria evidenced (test, fixture, screenshot, or log reference on the story).
- No resume text, filenames, or job secrets in logs or analytics.
- Kanban card and story `status` match.
- Reviewer named on the story.
- Public copy still matches [[Claims and Non Goals]].

## Board columns

Backlog → Spec Ready → Ready → In Progress → In Review → QA → Done

Blocked is a swimlane. Do not hide blocked work in In Progress.

## Knowledge graph updates

When implementation changes a contract, update the spec first, then the story, then any dependent stories. If the change alters a public claim, product owner must revise [[Claims and Non Goals]] before the card can leave Review.
