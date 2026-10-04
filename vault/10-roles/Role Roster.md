---
type: moc
tags:
  - moc
  - roles
aliases:
  - Role Roster
---

# Role roster

Named roles are responsibilities to assign to agents, not staffing commitments. Orchestrator may run multiple In Progress cards in parallel (see [[SDLC Operating Model]] — soft target 4–6 P0 lanes).

| Role | Skill | Agent | Owns |
|---|---|---|---|
| [[SDLC Orchestrator]] | `sdlc-orchestrator` | `sdlc-orchestrator` | Pick next card, enforce workflow |
| [[Product Owner]] | `product-owner` | `product-owner` | Scope, stories, claims, go/no-go |
| [[Tech Lead]] | `tech-lead` | `tech-lead` | Architecture, ADRs, spikes |
| [[Backend Developer]] | `backend-developer` | `backend-developer` | API, worker, queue, deletion |
| [[Frontend Developer]] | `frontend-developer` | `frontend-developer` | Next.js UI, a11y, landing tool |
| [[UX Designer]] | `ux-designer` | `ux-designer` | Flows, copy placement, a11y |
| [[QA Engineer]] | `qa-engineer` | `qa-engineer` | Corpus, gates, editor matrix |
| [[Security Engineer]] | `security-engineer` | `security-engineer` | Access, deletion, redaction |
| [[DevOps SRE]] | `devops-sre` | `devops-sre` | Runtime, caps, alerts, sweepers |
| [[Growth SEO]] | `growth-seo` | `growth-seo` | Content, sitemap, events |
| [[Code Reviewer]] | `code-reviewer` | `code-reviewer` | PR review vs contracts |
| [[Release Manager]] | `release-manager` | `release-manager` | Gates, launch, rollback |

Skills live in `.cursor/skills/<name>/SKILL.md`. Subagents live in `.cursor/agents/<name>.md`.
