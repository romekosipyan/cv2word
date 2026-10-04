# syntax=docker/dockerfile:1
#
# US-010 convert worker image — PyMuPDF (AGPL) + pdf2docx.
#
# ADR-003 accepted Option A (AGPL). Do NOT claim a commercial Artifex license.
# Source-offer / NOTICE residuals are launch-checklist items (not blockers here).
# Local / CI tag only until corresponding-source offer is documented for customers.
#
# Isolation controls match US-013: non-root, read-only root at runtime, no egress,
# 256 MiB tmpfs job temp, product caps. Conversion never runs in Next.js.

FROM python:3.12-slim-bookworm

LABEL org.resumetoword.story="US-010"
LABEL org.resumetoword.image_role="convert-engine"
LABEL org.resumetoword.contains_pymupdf="true"
LABEL org.resumetoword.pymupdf_license="AGPL-3.0"
LABEL org.resumetoword.pymupdf_pin="1.28.2"
LABEL org.resumetoword.pdf2docx_pin="0.5.13"
LABEL org.resumetoword.local_only="true"
LABEL org.resumetoword.publish="local-until-source-offer"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    WORKER_TMP_ROOT=/mnt/job-tmp \
    WORKER_CPU=1 \
    WORKER_MEMORY_MIB=1024 \
    WORKER_TMP_MIB=256 \
    WORKER_TIMEOUT_SECONDS=120 \
    WORKER_RASTER_MP=20

RUN apt-get update \
    && apt-get install -y --no-install-recommends coreutils findutils \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 worker \
    && useradd --uid 10001 --gid 10001 --home-dir /app --shell /usr/sbin/nologin --create-home worker \
    && mkdir -p /mnt/job-tmp /app/engine /app/inspect /app/isolation \
    && chown -R worker:worker /app /mnt/job-tmp \
    && chmod 0750 /mnt/job-tmp

WORKDIR /app

COPY --chown=worker:worker requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY --chown=worker:worker isolation/entrypoint.sh /app/isolation/entrypoint.sh
COPY --chown=worker:worker engine/ /app/engine/
COPY --chown=worker:worker inspect/inspect_pdf.py /app/inspect/inspect_pdf.py
RUN chmod 0755 /app/isolation/entrypoint.sh

USER 10001:10001

VOLUME ["/mnt/job-tmp"]

ENTRYPOINT ["/app/isolation/entrypoint.sh"]
# Default: show engine module help. Compose / ECS override with convert args.
CMD ["python3", "-m", "engine", "--help"]
