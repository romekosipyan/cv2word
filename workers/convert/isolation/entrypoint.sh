#!/bin/sh
# ResumeToWord convert-worker isolation entrypoint (US-013 / US-041).
# Creates a per-job temp dir on the tmpfs mount, enforces product caps, and
# always removes that dir on exit. Does not fetch PDF URLs.
set -eu

JOB_TMP_ROOT="${WORKER_TMP_ROOT:-/mnt/job-tmp}"
WORKER_TIMEOUT_SECONDS="${WORKER_TIMEOUT_SECONDS:-120}"
WORKER_MEMORY_MIB="${WORKER_MEMORY_MIB:-1024}"
WORKER_TMP_MIB="${WORKER_TMP_MIB:-256}"
WORKER_CPU="${WORKER_CPU:-1}"
WORKER_RASTER_MP="${WORKER_RASTER_MP:-20}"

# Product caps (SPEC-WORKER). Do not silently raise these.
PRODUCT_CPU=1
PRODUCT_MEMORY_MIB=1024
PRODUCT_TMP_MIB=256
PRODUCT_TIMEOUT_SECONDS=120
PRODUCT_RASTER_MP=20

if [ ! -d "$JOB_TMP_ROOT" ]; then
  echo "isolation_error=tmp_root_missing path=$JOB_TMP_ROOT" >&2
  exit 78
fi

# Refuse to use the Fargate ~20 GiB ephemeral disk for job bytes.
case "$JOB_TMP_ROOT" in
  /tmp|/var/tmp|/var/lib|/app)
    echo "isolation_error=tmp_root_forbidden path=$JOB_TMP_ROOT" >&2
    exit 78
    ;;
esac

# Harden: refuse env that would exceed product caps (US-041).
if [ "$WORKER_CPU" -gt "$PRODUCT_CPU" ] 2>/dev/null; then
  echo "isolation_error=cpu_cap_exceeded requested=$WORKER_CPU product=$PRODUCT_CPU" >&2
  exit 78
fi
if [ "$WORKER_MEMORY_MIB" -gt "$PRODUCT_MEMORY_MIB" ] 2>/dev/null; then
  echo "isolation_error=memory_cap_exceeded requested=$WORKER_MEMORY_MIB product=$PRODUCT_MEMORY_MIB" >&2
  exit 78
fi
if [ "$WORKER_TMP_MIB" -gt "$PRODUCT_TMP_MIB" ] 2>/dev/null; then
  echo "isolation_error=tmp_cap_exceeded requested=$WORKER_TMP_MIB product=$PRODUCT_TMP_MIB" >&2
  exit 78
fi
if [ "$WORKER_TIMEOUT_SECONDS" -gt "$PRODUCT_TIMEOUT_SECONDS" ] 2>/dev/null; then
  echo "isolation_error=timeout_cap_exceeded requested=$WORKER_TIMEOUT_SECONDS product=$PRODUCT_TIMEOUT_SECONDS" >&2
  exit 78
fi
if [ "$WORKER_RASTER_MP" -gt "$PRODUCT_RASTER_MP" ] 2>/dev/null; then
  echo "isolation_error=raster_cap_exceeded requested=$WORKER_RASTER_MP product=$PRODUCT_RASTER_MP" >&2
  exit 78
fi

JOB_DIR="$(mktemp -d "${JOB_TMP_ROOT}/job.XXXXXX")"
export TMPDIR="$JOB_DIR"
export TEMP="$JOB_DIR"
export TMP="$JOB_DIR"
export WORKER_JOB_TMP="$JOB_DIR"
export WORKER_CPU WORKER_MEMORY_MIB WORKER_TMP_MIB WORKER_TIMEOUT_SECONDS WORKER_RASTER_MP

cleanup() {
  status=$?
  if [ -n "${JOB_DIR:-}" ] && [ -d "$JOB_DIR" ]; then
    rm -rf "$JOB_DIR" || true
  fi
  # Best-effort sweep of stale job dirs if a prior crash left debris.
  find "$JOB_TMP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'job.*' -mmin +10 -exec rm -rf {} + 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT INT TERM

# Product RSS cap = 1 GiB. Fargate platform memory at 1 vCPU is 2 GiB (task
# definition). Compose enforces mem_limit=1g; here we write cgroup memory.max
# when writable. Nested cgroup may be deferred on Docker Desktop — never raise
# the product cap to match the Fargate platform size.
apply_memory_cap() {
  limit_bytes=$((WORKER_MEMORY_MIB * 1024 * 1024))
  for cg in /sys/fs/cgroup/memory.max /sys/fs/cgroup/$(cat /proc/self/cgroup 2>/dev/null | head -1 | cut -d: -f3)/memory.max; do
    if [ -w "$cg" ] 2>/dev/null; then
      echo "$limit_bytes" >"$cg" 2>/dev/null && {
        echo "isolation_cgroup_memory_mib=$WORKER_MEMORY_MIB path=$cg"
        return 0
      }
    fi
  done
  echo "isolation_cgroup_memory=deferred reason=not_writable expected_mib=$WORKER_MEMORY_MIB platform_note=fargate_2gib_task_product_1gib"
}
apply_memory_cap

echo "isolation_caps cpu=$WORKER_CPU memory_mib=$WORKER_MEMORY_MIB tmp_mib=$WORKER_TMP_MIB raster_mp=$WORKER_RASTER_MP timeout_s=$WORKER_TIMEOUT_SECONDS tmpdir=$JOB_DIR"

# Hard wall-clock cap. Validation failures must not be retried as infra (SPEC-WORKER).
if command -v timeout >/dev/null 2>&1; then
  timeout --signal=TERM --kill-after=10 "${WORKER_TIMEOUT_SECONDS}s" "$@"
else
  echo "isolation_error=timeout_binary_missing" >&2
  exit 78
fi
