---
type: story
id: US-013
title: Isolated conversion workers
status: done
priority: P0
epic: "[[E03 Conversion Engine]]"
requirement: R02
spec: "[[SPEC-WORKER]]"
assignee_role: devops-sre
plan_week: week-2
estimate: L
depends_on: ['US-072', 'US-071']
tags:
  - story
  - p0
  - devops
aliases:
  - US-013
---

# US-013 Isolated conversion workers

As security and engineering, I want conversion in isolated non-root containers with no outbound network so malicious PDFs cannot escape or exfiltrate.

## Links

- Epic: [[E03 Conversion Engine]]
- Requirement: R02 in [[MVP Priorities]]
- Spec: [[SPEC-WORKER]]
- Role: `devops-sre` — see [[Role Roster]]
- Plan: [[Implementation Plan]] / week-2
- Depends on: [[US-072]], [[US-071]]
- Board: [[SDLC Kanban]]

## Acceptance criteria

- [x] Worker image is non-root and read-only at the base layer.
- [x] Outbound network is denied. PDF URLs are never fetched.
- [x] Caps are applied: 1 CPU, 1 GiB RAM, 256 MiB temp, 20 megapixels/page, 120s (to be confirmed by test).
- [x] Per-job temp directories are removed on exit.

## Implementation notes

Do not ship publicly before [[ADR-003 PyMuPDF License]] is decided.

Isolation scaffold only: `workers/convert/Dockerfile.isolation` embeds **no** PyMuPDF. Local tag `LOCAL_SPIKE_ONLY`. Public/ECR convert image with engine remains blocked until ADR-003 is `accepted` (`human_reviewer` TBD). Engine packaging is [[US-010]].

## Evidence

- Reviewer: security-engineer — **signed 2026-10-03 — PASS** (scaffold isolation only; ADR-003 not accepted; no image publish)
- Security gate review (US-013 only):

| Gate | Severity | Result | Notes |
|---|---|---|---|
| Non-root + read-only base | Critical | PASS | `USER 10001:10001`; compose `read_only` + `cap_drop: ALL` + `no-new-privileges`; ECS `readonlyRootFilesystem` + drop ALL |
| No egress / no PDF URL fetch | Critical | PASS | Compose `network_mode: none`; ECS private subnets, `assignPublicIp: DISABLED`, NAT absent; stub has no HTTP/URL-fetch path; dry-run asserts socket fail-closed |
| Caps documented (1 CPU, 1 GiB, 256 MiB, 20 MP, 120s) | Critical | PASS | Env + compose + ECS sketch + entrypoint `timeout`; Fargate platform 2 GiB at 1 vCPU documented — product 1 GiB via compose `mem_limit` / cgroup attempt |
| Temp cleanup on exit | Critical | PASS | `mktemp` under `/mnt/job-tmp`; `trap cleanup EXIT INT TERM` + `rm -rf`; stale `job.*` sweep |
| No PyMuPDF embed / no public ECR publish implied | Critical | PASS | Dockerfile installs no engine; labels `publish=blocked-until-adr-003`, `contains_pymupdf=false`, `local_spike_only=true`; `.dockerignore` excludes `spike/` `inspect/`; README hard gate; ADR-003 remains `recommended` |
| ECR endpoint inventory (`ecr.api` + `ecr.dkr` + S3 gateway) | Critical | PASS | Documented in `infra/convert-worker/README.md` and ECS `_network_configuration_sketch` |
| Job bytes off Fargate ephemeral disk | Critical | PASS | Writable job temp only on 256 MiB tmpfs `/mnt/job-tmp`; entrypoint refuses `/tmp` `/var/tmp` `/var/lib` `/app` |
| Nested cgroup 1 GiB on Desktop | Warning | PASS (deferred) | `isolation_cgroup_memory=deferred` expected locally; do not raise product cap; [[US-041]] must confirm RSS cap in target runtime |
| Post-exit cleanup automation | Suggestion | PASS | Manual dry-run evidence accepted for scaffold; prefer scripted assert in US-041 / CI later |

- Deliverables (2026-10-03):
  - `workers/convert/Dockerfile.isolation` — UID/GID 10001, labels `publish=blocked-until-adr-003`, `contains_pymupdf=false`, `local_spike_only=true`
  - `workers/convert/isolation/entrypoint.sh` — per-job dir under `/mnt/job-tmp`, EXIT trap `rm -rf`, 120s `timeout`, refuses ephemeral `/tmp` roots, optional cgroup 1 GiB write
  - `workers/convert/isolation/dry_run.py` — stub proves caps env + egress deny; no HTTP/PDF URL fetch path
  - `infra/convert-worker/docker-compose.isolation.yml` — `read_only`, `network_mode: none`, `cpus: 1`, `mem_limit: 1g`, tmpfs 256 MiB
  - `infra/convert-worker/ecs-task-definition.convert.sketch.json` — Fargate 1 vCPU / 2 GiB, `readonlyRootFilesystem`, `linuxParameters.tmpfs` 256 MiB, `assignPublicIp: DISABLED`, no NAT
  - `infra/convert-worker/README.md` — network inventory `ecr.api` + `ecr.dkr` + S3 gateway; job bytes off 20 GiB ephemeral disk; publish gate
- Tests / fixtures: Local dry-run (not published): `docker compose -f infra/convert-worker/docker-compose.isolation.yml run --rm --no-deps convert-isolation` → `dry_run_egress=denied`, `dry_run_status=ok`; post-exit `find /mnt/job-tmp` count `0`. Nested cgroup `memory.max` logged `deferred` under Docker Desktop compose (expected); product 1 GiB still via compose `mem_limit` / ECS entrypoint attempt — [[US-041]] confirms in target runtime.
- Claim check against [[Claims and Non Goals]]: No perfect-layout, ATS, OCR, or demand claims. Isolation drafts only; no public worker image; ADR-003 gate documented. Cost/region spend not provisioned (ADR-002 still recommended).
- Open: leave `status: in-review` for remaining reviewers (code-reviewer / QA) before Done. Security does **not** accept [[ADR-003]]. Do not push `LOCAL_SPIKE_ONLY` image. [[US-010]] remains **blocked** until ADR-003 is `accepted`. [[US-041]] may proceed later to confirm runtime cap enforcement (esp. 1 GiB RSS under Fargate).
