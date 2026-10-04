# Convert worker isolation + engine — US-013 / US-010

Draft only. No cloud resources are provisioned from this folder. ADR-002 hosting shape is `recommended`, not accepted.

## License / publish gates

| Gate | Status |
|---|---|
| [[ADR-003 PyMuPDF License]] | **accepted** Option A (AGPL) 2026-10-04 |
| Local convert engine image (`Dockerfile`) | Allowed as `LOCAL_AGPL` — do not push until source-offer / NOTICE residuals are done |
| Public / ECR convert image embedding PyMuPDF | Allowed under AGPL **with** corresponding-source offer + notice policy (launch checklist) |
| Isolation scaffold (`Dockerfile.isolation`) | Local dry-run only (`LOCAL_SPIKE_ONLY`); embeds **no** PyMuPDF |

`workers/convert/Dockerfile.isolation` proves isolation controls without the engine. `workers/convert/Dockerfile` packages the US-010 engine (PyMuPDF `1.28.2` + pdf2docx `0.5.13`) under AGPL. Do **not** claim a commercial Artifex license.

Do **not**:

- `docker push` `resumetoword/convert-isolation:*`
- Tag this image for a customer-reachable registry
- `docker push` customer-reachable AGPL images before source-offer / NOTICE residuals are complete

Isolation labels: `org.resumetoword.contains_pymupdf=false`, `org.resumetoword.local_spike_only=true`.
Engine labels: `org.resumetoword.contains_pymupdf=true`, `org.resumetoword.pymupdf_license=AGPL-3.0`, `org.resumetoword.local_only=true`.

## Acceptance mapping

| AC | How this draft meets it |
|---|---|
| Non-root + read-only base | UID/GID `10001`; compose `read_only: true`; ECS `readonlyRootFilesystem: true` |
| Outbound denied; PDF URLs never fetched | Compose `network_mode: none`; ECS private subnet, `assignPublicIp: DISABLED`, **no NAT**; SG egress = VPC endpoints only. Stub has no URL-fetch path |
| Caps 1 CPU / 1 GiB / 256 MiB / 20 MP / 120s | Compose `cpus` + `mem_limit: 1g` + 256m tmpfs; env caps; entrypoint `timeout`; ECS 1 vCPU / 2 GiB platform + cgroup attempt for 1 GiB |
| Per-job temp removed on exit | `entrypoint.sh` `mktemp` under `/mnt/job-tmp` + `trap cleanup EXIT` |

## Local dry-run (optional, no publish)

From repo root (Docker Desktop required):

```bash
# Isolation only (no engine)
docker compose -f infra/convert-worker/docker-compose.isolation.yml build
docker compose -f infra/convert-worker/docker-compose.isolation.yml run --rm --no-deps convert-isolation

# US-010 engine (AGPL PyMuPDF) — generate fixtures first
python workers/convert/tests/generate_fixtures.py
docker compose -f infra/convert-worker/docker-compose.convert.yml build
```

Isolation expected: `dry_run_egress=denied`, `dry_run_status=ok`.
Engine tag: `resumetoword/convert-engine:LOCAL_AGPL`. Leave it local until source-offer policy ships.

## Network policy notes (ADR-002 + US-072 warnings)

Worker tasks sit on **private subnets** with:

- `assignPublicIp: DISABLED`
- **No NAT Gateway** and no default route to `0.0.0.0/0`
- Security group **egress allowlist** limited to VPC endpoint prefix lists (and RDS instance SG for SQL when used)

### VPC endpoints required for a no-NAT convert task

US-072 reviewer warning: a single “ECR endpoint” fails closed. Inventory:

| Endpoint | Purpose |
|---|---|
| `com.amazonaws.region.ecr.api` | ECR API (auth, manifest) |
| `com.amazonaws.region.ecr.dkr` | ECR Docker protocol |
| `com.amazonaws.region.s3` (**gateway**) | Image layers + private object Get/Put/Delete |
| `com.amazonaws.region.logs` | CloudWatch Logs |
| `com.amazonaws.region.secretsmanager` | Secrets (never in URLs) |
| `com.amazonaws.region.sqs` | Queue receive/delete |

SQL to RDS uses the instance private IP / SG — not an “RDS API” interface endpoint.

Workers must not hold credentials that can call public internet APIs. Queue payloads carry **job references only**, never file bytes or bearer secrets.

### PDF URLs

SPEC-WORKER: link schemes are allowlisted for **output sanitization**; workers **never fetch** URLs found inside PDFs. Isolation makes accidental fetch fail closed (no egress). Application code must still omit fetch logic ([[US-010]]).

## tmpfs and the 20 GiB ephemeral disk (US-072)

Fargate attaches ~20 GiB ephemeral storage. Product rule:

1. `readonlyRootFilesystem: true`
2. Writable job temp **only** on a **256 MiB** mount at `/mnt/job-tmp`
3. Entrypoint refuses `WORKER_TMP_ROOT` of `/tmp`, `/var/tmp`, or other ephemeral paths
4. Per-job dirs deleted on exit (`trap`); stale `job.*` dirs older than 10 minutes swept best-effort
5. S3 lifecycle does **not** cover worker disk — wipe on exit is mandatory

Compose dry-run: `tmpfs: /mnt/job-tmp:size=256m,...`.

## Fargate memory note (US-041 confirmed)

At 1 vCPU, Fargate requires **2 GiB** task memory. That is a **platform floor**, not the product RSS budget.

| Layer | CPU | RAM | Temp | Raster | Time |
|---|---|---|---|---|---|
| Product (SPEC-WORKER) | 1 | **1 GiB** | **256 MiB** tmpfs | **20 MP**/page | **120s** |
| Fargate task sketch | 1 vCPU (`1024`) | 2 GiB (`2048`) | — | — | `stopTimeout` 120 |
| Compose dry-run | `cpus: 1.0` | `mem_limit: 1g` | tmpfs `256m` | env | entrypoint `timeout` |
| Entrypoint | env refuse `>` product | cgroup `memory.max` = 1 GiB when writable | refuse ephemeral `/tmp` roots | env refuse `>` 20 | hard `timeout` 120s |

Enforcement paths:

1. **Compose:** `mem_limit` / `memswap_limit` = 1g (product cap on the container).
2. **ECS sketch:** task memory 2048 (Fargate minimum at 1 vCPU) + entrypoint cgroup write to 1024 MiB when `/sys/fs/cgroup/.../memory.max` is writable.
3. **Entrypoint:** refuses env that exceeds product caps; requires `timeout` binary; never raises product caps to match the 2 GiB platform size.
4. **Nested cgroup deferred** on Docker Desktop is expected (`isolation_cgroup_memory=deferred`); compose `mem_limit` still holds the 1 GiB product cap locally.

Do **not** set `WORKER_MEMORY_MIB=2048` to “match Fargate.”

## Files

| Path | Role |
|---|---|
| `workers/convert/Dockerfile.isolation` | Non-root isolation image, **no PyMuPDF** |
| `workers/convert/Dockerfile` | US-010 engine image (AGPL PyMuPDF + pdf2docx) |
| `workers/convert/isolation/entrypoint.sh` | Caps, tmpfs job dir, cleanup, 120s timeout |
| `workers/convert/isolation/dry_run.py` | Local proof stub (egress deny + temp) |
| `workers/convert/engine/` | Inspect + convert + minimal native-text gate |
| `docker-compose.isolation.yml` | Isolation dry-run, `network_mode: none` |
| `docker-compose.convert.yml` | Engine local image, `network_mode: none` |
| `ecs-task-definition.convert.sketch.json` | Fargate sketch — not for apply |

## Capacity reject (job API, US-041)

Worker isolation does not admit jobs. The Next.js job API rejects `POST /api/jobs` with `queue_full` when:

`predicted_wait ≈ (queued + in_flight) × CAPACITY_P50_JOB_SECONDS / max(CAPACITY_READY_WORKERS, 1) > CAPACITY_MAX_WAIT_SECONDS`

Defaults: p50 placeholder **30s** (not measured), ready workers **10**, max wait **120s**. Response includes `retryAfterSeconds` + `Retry-After`. No charge, no progress percentage. See `apps/web/src/lib/capacity/`.

## Related

- Spec: [[SPEC-WORKER]]
- ADR: [[ADR-002 Hosting Store and Queue]], [[ADR-003 PyMuPDF License]]
- Caps + capacity reject: [[US-041]]
- Engine image (AGPL local): [[US-010]]
