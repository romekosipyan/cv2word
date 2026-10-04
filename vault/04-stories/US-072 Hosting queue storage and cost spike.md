---
type: story
id: US-072
title: Hosting queue storage and cost spike
status: done
priority: P0
epic: "[[E01 Feasibility]]"
requirement: R06
spec: "[[Architecture]]"
assignee_role: devops-sre
plan_week: week-1
estimate: M
depends_on: []
tags:
  - story
  - p0
  - spike
aliases:
  - US-072
---

# US-072 Hosting queue storage and cost spike

As SRE, I want a hosting recommendation for private object storage, a lease-capable queue, a small relational database, and isolated workers so Week 2 can start without replatforming.

## Links

- Epic: [[E01 Feasibility]]
- Requirement: R06 in [[MVP Priorities]]
- Spec: [[Architecture]]
- Role: `devops-sre` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-1
- Depends on: None
- Board: [[SDLC Kanban]]
- Decisions: [[ADR-002 Hosting Store and Queue]], [[ADR-001 Processing Region]]

## Acceptance criteria

- [x] [[ADR-002 Hosting Store and Queue]] lists a recommended option with rough monthly cost at 10 concurrent jobs.
- [x] The option can enforce no-egress workers, private buckets, and a 5-minute sweeper.
- [x] A region candidate is proposed for [[ADR-001 Processing Region]].

## Implementation notes

Do not treat cost numbers as commitments.

## Evidence

- Reviewer: code-reviewer (signed 2026-10-03). Verdict: **pass**. `status` left `in-review`. Kanban column not moved.
- Tests / fixtures: None provisioned. Recommendation only. Thin service/env sketch in `infra/README.md`. No Terraform, no cloud accounts, no production resources.
- Claim check against [[Claims and Non Goals]]: Cost (~$550/month at 10 concurrent jobs, range ~$530–600) is labeled a planning assumption, not a quote. No legal-compliance claim. No pixel-identical, ATS, or demand claims. File backups/versions outside the [[Deletion Contract]] are forbidden. Alerts stay redacted. PyMuPDF AGPL vs commercial left to [[ADR-003 PyMuPDF License]].
- Recommendation: AWS `eu-central-1`, S3 + RDS PostgreSQL + SQS + ECS/Fargate. ADR-002 status `recommended` (human spend/processor approval still required). ADR-001 remains `open` with Frankfurt as the region candidate.
- Isolation/deletion (design, not implemented): no-NAT private subnets; S3 Block Public Access; versioning/replication/AWS Backup off on file buckets; EventBridge sweeper every 5 minutes; lifecycle is a safety net only; `queue_full` when predicted wait > 120s. Conversion stays out of Next.js request handlers in [[Architecture]], ADR-002, and `infra/README.md`.
- Week 2 may design against this stack (US-003 / US-012 / US-013 / US-030 / US-041). Do not provision production accounts from the ADR.
- Remaining human approvals: cloud spend; processor identity on the privacy notice; launch country and region acceptance ([[ADR-001]] still `open`); PyMuPDF license ([[ADR-003]], blocks shipping a worker image, not this hosting shape).
- Reviewer doc fixes (factual only): Architecture queue note no longer lists Redis as a P0 option; ADR-002 “neither savings” sentence corrected (B and C cost more); ADR-002 no-egress allowlist no longer treats RDS SQL as a VPC endpoint.

### Critical

None. Acceptance criteria are met. No resume-text-in-DB path, no silent OCR pick, no accepted-as-law cost/region, no conversion-in-Next.js design.

### Warning

- **ECR pull inventory is incomplete for a no-NAT worker.** Image pull needs `ecr.api` + `ecr.dkr` plus the S3 gateway for layers. A single “ECR VPC endpoint” will fail closed in [[US-013]]. Carry the full inventory into the task/VPC story.
- **Fargate still attaches ~20 GiB ephemeral disk.** `tmpfs` + `readonlyRootFilesystem` is the right product cap, but US-013 must keep job bytes off ephemeral storage and wipe it on exit. Lifecycle on S3 does not cover that disk.
- **Frankfurt on-demand Fargate sits at the high end of the $530–600 band.** The $400–430 convert line looks closer to a US-ish or blended figure than a quoted `eu-central-1` list. Re-price on the Frankfurt list before spend approval; do not treat ~$550 as a budget cap.
- **SQS standard is at-least-once.** Visibility timeout is a lease, not exactly-once delivery. [[US-012]] must keep duplicate output writes impossible (lease + destination key + tombstone). Do not add Redis to paper over that.

### Suggestion

- `CAPACITY_P50_JOB_SECONDS=30` in `infra/README.md` should stay an unmeasured placeholder. The PRD 30s figure is a p95 planning assumption, not a measured p50.
- Presigned PUT signatures are query-string capabilities. [[US-003]] must keep the job bearer secret out of URLs, referrers, and analytics; short-lived prefix-scoped S3 signatures are not a substitute for that secret.
- “Internal-or-public ALB” is too loose for Week 2. Public HTTPS for the site, private targets, no CloudFront in front of file objects.
- AWS has no Azure/GCS-style blob soft-delete default; say “versioning and delete-marker retention off” so US-013/US-030 checklists do not hunt a nonexistent S3 switch.
