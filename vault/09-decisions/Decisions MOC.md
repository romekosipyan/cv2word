---
type: moc
tags:
  - moc
  - adr
aliases:
  - Decisions MOC
---

# Decisions

Open decisions block coding only when a story lists them as `blocks`. Launch blockers must be closed before public MVP.

| ID | Decision | Status | Blocks |
|---|---|---|---|
| [[ADR-001 Processing Region]] | Processing region (launch country residual) | **accepted — `eu-central-1`** (2026-10-04); launch country + processor list residual for [[US-111]] | [[US-111]] notice drafting unblocked; public collection still needs published notice |
| [[ADR-002 Hosting Store and Queue]] | Object store, queue, worker host | recommended (AWS S3 + RDS + SQS + Fargate) | [[US-012]], [[US-013]]; spend still needs human approval |
| [[ADR-003 PyMuPDF License]] | AGPL vs commercial | **accepted — Option A (AGPL)** (2026-10-04); source-offer/notice residuals before public launch | [[US-010]] unblocked; launch checklist residuals |
| [[ADR-004 pdf2docx Maintenance]] | Pin, patch, or fork | **accepted — pin `0.5.13`, no fork** (2026-10-04); revisit on concrete reconstruction defect | [[US-010]] unblocked on pin/fork; residual revisit triggers only |
| [[ADR-005 Font Policy]] | Approved substitutions | proposed ([[US-073]]) | [[US-011]] (enforce); product confirm |
| [[ADR-006 Editor Versions]] | Word and LibreOffice matrix | proposed ([[US-073]]) | [[US-094]] (verify builds) |
| [[ADR-007 Free Quota]] | 3/24h confirmation | **accepted — 3 jobs / 24h / session** (2026-10-04) | public copy / [[Supported Files and Limits]]; [[US-040]] defaults match |
| [[ADR-008 Consent and Legal Basis]] | Telemetry and processors | **accepted — essential-only P0; marketing off** (2026-10-04); counsel residuals on [[US-111]] | [[US-053]] posture confirmed; notice/legal-basis wording still launch residual |

Product also still decides interface language (English P0), support process, and any price test. Finance/product approve refunds before [[US-083]].
