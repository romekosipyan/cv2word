---
type: moc
tags:
  - moc
  - home
aliases:
  - Home
  - ResumeToWord
---

# ResumeToWord Knowledge Graph

SEO-first resume PDF to editable DOCX converter. Agents start here, then follow wikilinks. Status lives on [[SDLC Kanban]].

## Operate

- [[SDLC Operating Model]]
- [[SDLC Kanban]]
- [[Implementation Plan]]
- [[Role Roster]]
- [[Story Template]]
- [[Conventions]]

## Product

- [[PRD Contract]]
- [[Product Vision]]
- [[Audience and JTBD]]
- [[Claims and Non Goals]]
- [[MVP Priorities]]
- [[Supported Files and Limits]]
- [[UX Contract]]
- [[Motion Design Direction]]

## Delivery artifacts

- [[Specs MOC]]
- [[Stories MOC]]
- [[Epics MOC]]
- [[Architecture]]
- [[Decisions MOC]]
- [[Quality MOC]]
- [[Security MOC]]
- [[Growth MOC]]

## Current program

P0 public MVP: anonymous text-PDF conversion, honest quality warnings, private short-lived storage, indexable landing page.

P1 stays gated: OCR, paid enhancement, comparison view, reconstruction fallback.

## Next action

Follow [[Kickoff]].

1. Open [[SDLC Kanban]].
2. Pull the highest ready P0 card whose dependencies are done.
3. Open the story and load the named role skill.
4. Execute against the linked spec, then update the card.

```dataview
TABLE status AS Status, priority AS Priority, assignee_role AS Role, epic AS Epic
FROM "04-stories"
WHERE type = "story" AND status != "done"
SORT priority ASC, id ASC
```
