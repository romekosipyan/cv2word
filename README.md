# ResumeToWord

SEO-first resume PDF to editable DOCX converter. Product contract: `ResumeToWord_PRD.docx`. Agents work from the Obsidian vault and the internal kanban.

License: [MIT](LICENSE).

## Open the knowledge graph

1. Install [Obsidian](https://obsidian.md).
2. Open folder `vault/` as the vault (not the repo root).
3. Enable community plugins **Kanban** and **Dataview**, or trust the bundled settings and install those two.
4. Open `00 Home.md`, then `board/SDLC Kanban.md`.
5. Open Graph view to see product → spec → story links.

## Agent kickoff

In Cursor:

1. Read `AGENTS.md`.
2. Invoke the `sdlc-orchestrator` skill or agent.
3. First parallel cards: `US-070` (fidelity spike) and `US-072` (hosting/cost).
4. Do not start P1 stories. Do not write conversion code until the spike notes exist.

Role skills live in `.cursor/skills/`. Role agents live in `.cursor/agents/`.

## Planned application layout

Not scaffolded yet. Create during Week 2 after the spike:

```
apps/web/          Next.js marketing, converter UI, job API
workers/convert/   Isolated Python conversion workers
infra/             Queue, storage, worker runtime
vault/             Knowledge graph + kanban
```
