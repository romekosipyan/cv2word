import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import type { ErrorCode } from "../errors";
import { log } from "../logging";
import type { LeasedQueueMessage } from "../queue";
import { getObjectStorage } from "../storage/filesystem";
import type { JobRecord } from "./types";
import type { SimulatedWorkResult, WorkerFailureKind } from "./worker-sim";

const VALIDATION_CODES = new Set<ErrorCode>([
  "unsupported_type",
  "too_large",
  "too_many_pages",
  "encrypted",
  "corrupt",
  "scan_detected",
  "output_invalid",
]);

function repoRootFromCwd(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "..", "..");
  }
  return cwd;
}

function resolveConvertRoot(): string {
  if (process.env.CONVERT_ENGINE_ROOT) {
    return path.resolve(process.env.CONVERT_ENGINE_ROOT);
  }
  return path.resolve(repoRootFromCwd(), "workers", "convert");
}

function resolvePython(): string {
  if (process.env.CONVERT_PYTHON) {
    return process.env.CONVERT_PYTHON;
  }
  if (process.env.PDF_INSPECT_PYTHON) {
    return process.env.PDF_INSPECT_PYTHON;
  }
  const root = repoRootFromCwd();
  const candidates = [
    path.join(root, "workers", "convert", ".venv", "Scripts", "python.exe"),
    path.join(root, "workers", "convert", ".venv", "bin", "python"),
    path.join(root, "workers", "convert", "spike", ".venv", "Scripts", "python.exe"),
    path.join(root, "workers", "convert", "spike", ".venv", "bin", "python"),
    path.join(root, "workers", "convert", "inspect", ".venv", "Scripts", "python.exe"),
    path.join(root, "workers", "convert", "inspect", ".venv", "bin", "python"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "python" : "python3";
}

function mapError(raw: unknown): ErrorCode {
  if (typeof raw === "string" && VALIDATION_CODES.has(raw as ErrorCode)) {
    return raw as ErrorCode;
  }
  return "conversion_failed";
}

function mapKind(raw: unknown, code: ErrorCode): WorkerFailureKind {
  if (raw === "validation" || VALIDATION_CODES.has(code)) return "validation";
  return "infra";
}

type PipelineJson = {
  ok?: boolean;
  error?: string;
  kind?: string;
  engine_version?: string;
  warnings?: unknown;
};

/**
 * Spawn the Python convert CLI (PyMuPDF inspect + pdf2docx).
 * Must not run inside a Next.js request handler — callers use the queue loop.
 * Never logs resume text or document dumps.
 */
export function runConvertPipeline(input: {
  pdfPath: string;
  docxPath: string;
  sizeBytes?: number;
}): Promise<SimulatedWorkResult> {
  const python = resolvePython();
  const cwd = resolveConvertRoot();
  const args = [
    "-m",
    "engine",
    "--input",
    input.pdfPath,
    "--output",
    input.docxPath,
  ];
  if (typeof input.sizeBytes === "number") {
    args.push("--size-bytes", String(input.sizeBytes));
  }

  return new Promise((resolve) => {
    const child = spawn(python, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONPATH: cwd,
      },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 120_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 64_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 16_000) child.kill("SIGKILL");
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, kind: "infra", code: "conversion_failed" });
    });

    child.on("close", () => {
      clearTimeout(timer);
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
        const parsed = JSON.parse(line) as PipelineJson;
        delete (parsed as Record<string, unknown>).text;
        delete (parsed as Record<string, unknown>).content;
        delete (parsed as Record<string, unknown>).page_text;
        delete (parsed as Record<string, unknown>).extract;

        if (parsed.ok === true) {
          const warnings = Array.isArray(parsed.warnings)
            ? (parsed.warnings as string[])
            : [];
          resolve({
            ok: true,
            engineVersion:
              typeof parsed.engine_version === "string"
                ? parsed.engine_version
                : "pymupdf-1.28.2+pdf2docx-0.5.13",
            warnings,
          });
          return;
        }
        const code = mapError(parsed.error);
        resolve({
          ok: false,
          kind: mapKind(parsed.kind, code),
          code,
        });
      } catch {
        void stderr;
        resolve({ ok: false, kind: "infra", code: "conversion_failed" });
      }
    });
  });
}

/**
 * Queue-leased convert work: temp DOCX → Python engine → object store.
 * Conversion stays outside the HTTP request path (Architecture / SPEC-WORKER).
 */
export async function convertLeasedJob(ctx: {
  job: JobRecord;
  message: LeasedQueueMessage;
}): Promise<SimulatedWorkResult> {
  const { job, message } = ctx;
  const storage = getObjectStorage();
  const inputKey = job.originalObjectKey;
  if (!inputKey) {
    return { ok: false, kind: "validation", code: "corrupt" };
  }

  const localPdf = storage.getLocalPath?.(inputKey);
  if (!localPdf || !fs.existsSync(localPdf)) {
    return { ok: false, kind: "validation", code: "corrupt" };
  }

  const size = (await storage.getObjectSize?.(inputKey)) ?? undefined;
  const tempRoot = await storage.registerTempDisk(job.id, "convert");
  const outPath = path.join(tempRoot, "resume-editable.docx");

  const result = await runConvertPipeline({
    pdfPath: localPdf,
    docxPath: outPath,
    sizeBytes: size ?? undefined,
  });

  if (!result.ok) {
    log.info("job_convert_failed", {
      jobId: job.id,
      error: result.code,
      kind: result.kind,
    });
    return result;
  }

  if (!fs.existsSync(outPath)) {
    return { ok: false, kind: "infra", code: "conversion_failed" };
  }

  const bytes = await fsp.readFile(outPath);
  if (bytes.length === 0) {
    return { ok: false, kind: "validation", code: "output_invalid" };
  }

  // Sticky destination from the queue message — never fork under redelivery.
  await storage.putObject(message.body.outputObjectKey, bytes);

  try {
    await fsp.unlink(outPath);
  } catch {
    // Job cleanup / US-032 wipe covers leftovers.
  }

  log.info("job_convert_ok", {
    jobId: job.id,
    engineVersion: result.engineVersion,
  });
  return result;
}
