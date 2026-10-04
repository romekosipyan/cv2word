# ResumeToWord — Agent Operating Manual

Agents work from the Obsidian vault knowledge graph and the internal SDLC kanban. Do not invent product claims, stack choices, or story status outside those sources.

## Start every task here

1. Read `vault/00 Home.md`.
2. Open `vault/board/SDLC Kanban.md` and claim or update the story card.
3. Open the story note, then follow its outbound links to the spec, epic, architecture, and role skill.
4. Load the matching project skill in `.cursor/skills/<role>/SKILL.md`.
5. When the work changes status, update the story frontmatter **and** the kanban card in the same turn.

## Source of truth

| Concern | Canonical note |
|---|---|
| Product contract | `vault/01-product/PRD Contract.md` |
| Non-goals and claims | `vault/01-product/Claims and Non Goals.md` |
| Architecture | `vault/02-architecture/Architecture.md` |
| Story work | `vault/04-stories/` |
| Delivery sequence | `vault/05-implementation/Implementation Plan.md` |
| Board | `vault/board/SDLC Kanban.md` |
| Role roster | `vault/10-roles/Role Roster.md` |

The Word PRD at `ResumeToWord_PRD.docx` is the originating document. Structured vault notes supersede informal chat. If vault and PRD diverge, stop and record an exception in `vault/09-decisions/`.

## Hard product rules

- P0 is anonymous, free, and single-file. No account, email, or hidden checkout.
- Conversion runs in isolated Python workers, never in a Next.js request handler.
- A successful DOCX must contain editable native text. Image-only pages are a failure.
- No silent OCR or content-dropping fallback.
- Job ID alone never authorizes access. Secrets never appear in URLs or analytics.
- Do not store extracted resume text in the database, logs, or analytics.
- Do not claim pixel-identical layout, ATS compatibility, or validated market demand.

## Repo layout (planned)

```
apps/web/          Next.js marketing + converter UI + job API
workers/convert/   Isolated Python conversion workers
infra/             Queue, storage, and worker runtime
vault/             Obsidian knowledge graph + kanban
.cursor/           Rules, skills, and role agents
```

## Kickoff

Use the `sdlc-orchestrator` skill to pick the next ready story, assign a role, and move the kanban card. Use role skills for execution. Use `code-reviewer`, `qa-engineer`, and `security-engineer` before moving a card to Done.
