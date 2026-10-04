#!/usr/bin/env python3
"""Local isolation dry-run for US-013. No PyMuPDF. No PDF URL fetches."""

from __future__ import annotations

import os
import socket
import sys
import tempfile
from pathlib import Path


def _require_job_tmp() -> Path:
    raw = os.environ.get("WORKER_JOB_TMP") or os.environ.get("TMPDIR")
    if not raw:
        raise SystemExit("dry_run_error=missing_WORKER_JOB_TMP")
    path = Path(raw)
    if not path.is_dir():
        raise SystemExit(f"dry_run_error=job_tmp_missing path={path}")
    root = os.environ.get("WORKER_TMP_ROOT", "/mnt/job-tmp")
    if not str(path).startswith(root.rstrip("/") + "/") and str(path) != root:
        raise SystemExit(
            f"dry_run_error=job_tmp_outside_tmpfs path={path} root={root}"
        )
    return path


def _assert_no_egress() -> None:
    """Prove outbound sockets fail under network_mode=none / no-egress SG."""
    try:
        socket.create_connection(("1.1.1.1", 443), timeout=2)
    except OSError:
        print("dry_run_egress=denied")
        return
    raise SystemExit("dry_run_error=egress_unexpectedly_open")


def _assert_caps_present() -> None:
    expected = {
        "WORKER_CPU": "1",
        "WORKER_MEMORY_MIB": "1024",
        "WORKER_TMP_MIB": "256",
        "WORKER_RASTER_MP": "20",
        "WORKER_TIMEOUT_SECONDS": "120",
    }
    for key, value in expected.items():
        got = os.environ.get(key)
        if got != value:
            raise SystemExit(f"dry_run_error=cap_mismatch key={key} got={got!r} want={value!r}")
    print(
        "dry_run_caps "
        f"cpu={expected['WORKER_CPU']} "
        f"memory_mib={expected['WORKER_MEMORY_MIB']} "
        f"tmp_mib={expected['WORKER_TMP_MIB']} "
        f"raster_mp={expected['WORKER_RASTER_MP']} "
        f"timeout_s={expected['WORKER_TIMEOUT_SECONDS']}"
    )


def main() -> int:
    # Invariant: never fetch PDF-embedded URLs (SPEC-WORKER). This stub has
    # no HTTP client path for document links by design.
    job_tmp = _require_job_tmp()
    _assert_caps_present()
    _assert_no_egress()

    marker = job_tmp / "marker.txt"
    marker.write_text("isolation-ok\n", encoding="utf-8")
    with tempfile.NamedTemporaryFile(dir=job_tmp, delete=False) as handle:
        handle.write(b"temp-bytes")
        nested = Path(handle.name)
    if not marker.is_file() or not nested.is_file():
        raise SystemExit("dry_run_error=temp_write_failed")

    print(f"dry_run_temp_ok path={job_tmp}")
    print("dry_run_status=ok")
    print("dry_run_note=entrypoint_trap_removes_job_tmp_on_exit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
