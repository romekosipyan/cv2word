# Convert workers

## Engine (US-010 / US-011)

PyMuPDF inspect + pdf2docx reconstruct + output validation in an isolated Python process. Pins match the US-070 spike / ADR-003 Option A (AGPL):

| Package | Pin |
|---|---|
| PyMuPDF | `1.28.2` |
| pdf2docx | `0.5.13` |
| python-docx | `1.2.0` |

Do **not** claim a commercial Artifex license. Corresponding-source offer and producer-notice residuals are launch-checklist items (ADR-003), not blockers for local/CI engine use.

```
cd workers/convert
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python tests/generate_fixtures.py
python -m engine --input tests/fixtures/simple_text.pdf --output %TEMP%\out.docx
python -m unittest tests.test_pipeline tests.test_validate
```

US-011 validation (before success): native editable text, page completeness / recall vs source, strip metadata/attachments/unsafe external relationships, reject macros and embedded fonts, attach ADR-005 font warnings, default download name `resume-editable.docx`. Empty or omitted-page output → `output_invalid` (validation, not infra-retried).

Local-dev Job API wires the queue lease loop (`apps/web` `processOneConvertJob` / instrumentation) to spawn `python -m engine`. Conversion never runs inside a Next.js request handler.

Engine image (local only until source-offer residuals):

```
docker compose -f infra/convert-worker/docker-compose.convert.yml build
```

Tag: `resumetoword/convert-engine:LOCAL_AGPL`. Do not push to a customer-reachable registry until ADR-003 compliance residuals are done.

## Isolation scaffold (US-013)

`Dockerfile.isolation` + `isolation/` prove non-root, read-only root, no-egress, 256 MiB tmpfs job temp, caps env, and exit cleanup. **No PyMuPDF** is installed or copied. Local dry-run only:

```
docker compose -f infra/convert-worker/docker-compose.isolation.yml build
docker compose -f infra/convert-worker/docker-compose.isolation.yml run --rm --no-deps convert-isolation
```

Image tag: `resumetoword/convert-isolation:LOCAL_SPIKE_ONLY`. Do not push. Docs: `infra/convert-worker/README.md`. ECS sketch: `infra/convert-worker/ecs-task-definition.convert.sketch.json`.

## Inspect sidecar (US-002)

`inspect/` is a short-lived PyMuPDF CLI used by the Job API `complete-upload` path to reject bad PDFs **before** queueing. It does not run pdf2docx and does not OCR.

```
cd workers/convert/inspect
# reuse spike/engine venv or: python -m venv .venv && pip install -r requirements.txt
python generate_fixtures.py
python inspect_pdf.py fixtures/a4_text.pdf
```

Synthetic fixtures only (`example.test` / `555` numbers). Never paste resume text into vault notes.

Env overrides for the Node helper: `PDF_INSPECT_PYTHON`, `PDF_INSPECT_SCRIPT`.
Convert worker env: `CONVERT_PYTHON`, `CONVERT_ENGINE_ROOT`, `CONVERT_WORKER=0` to disable the poll loop.

## Spike only

`spike/` is the `US-070` local feasibility harness: inspect with PyMuPDF, reconstruct with pdf2docx, score synthetic fixtures by layout class.

```
cd workers/convert/spike
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python generate_fixtures.py
python harness.py
```

Results: `spike/RESULTS.md`. Conversion never runs in Next.js.
