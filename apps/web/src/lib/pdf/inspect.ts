import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { ErrorCode } from "../errors";
import { MAX_UPLOAD_BYTES } from "./limits";

export type InspectOk = {
  ok: true;
  pageCount: number;
  sizeBytes: number;
  warnings: string[];
};

export type InspectFail = {
  ok: false;
  error: ErrorCode;
  pageCount: number;
  sizeBytes?: number;
};

export type InspectResult = InspectOk | InspectFail;

const VALIDATION_CODES = new Set<ErrorCode>([
  "unsupported_type",
  "too_large",
  "too_many_pages",
  "encrypted",
  "corrupt",
  "scan_detected",
]);

function repoRootFromCwd(): string {
  // apps/web is the Next/vitest cwd; inspect lives at workers/convert/inspect.
  const cwd = process.cwd();
  if (path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "..", "..");
  }
  return cwd;
}

function resolveInspectScript(): string {
  if (process.env.PDF_INSPECT_SCRIPT) {
    return path.resolve(process.env.PDF_INSPECT_SCRIPT);
  }
  return path.resolve(
    repoRootFromCwd(),
    "workers",
    "convert",
    "inspect",
    "inspect_pdf.py",
  );
}

function resolvePython(): string {
  if (process.env.PDF_INSPECT_PYTHON) {
    return process.env.PDF_INSPECT_PYTHON;
  }
  const root = repoRootFromCwd();
  const candidates = [
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
  return "corrupt";
}

/**
 * Run PyMuPDF inspect via a short-lived Python sidecar.
 * Does not run pdf2docx. Does not OCR. Output must never include resume text.
 */
export function inspectPdfFile(
  absolutePath: string,
  sizeBytes?: number,
): Promise<InspectResult> {
  const script = resolveInspectScript();
  const python = resolvePython();
  const args = [script, absolutePath];
  if (typeof sizeBytes === "number") {
    args.push("--size-bytes", String(sizeBytes));
  }

  return new Promise((resolve) => {
    const child = spawn(python, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Avoid locale noise; never inherit debug dumps of document content.
        PYTHONUTF8: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 30_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      // Cap stdout so a buggy script cannot flood memory with text.
      if (stdout.length > 64_000) {
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 16_000) {
        child.kill("SIGKILL");
      }
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, error: "corrupt", pageCount: 0 });
    });

    child.on("close", () => {
      clearTimeout(timer);
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
        const parsed = JSON.parse(line) as Record<string, unknown>;
        // Defense: drop any accidental text-bearing fields.
        delete parsed.text;
        delete parsed.content;
        delete parsed.page_text;
        delete parsed.extract;

        if (parsed.ok === true) {
          resolve({
            ok: true,
            pageCount: Number(parsed.page_count) || 0,
            sizeBytes: Number(parsed.size_bytes) || sizeBytes || 0,
            warnings: Array.isArray(parsed.warnings)
              ? (parsed.warnings as string[])
              : [],
          });
          return;
        }
        resolve({
          ok: false,
          error: mapError(parsed.error),
          pageCount: Number(parsed.page_count) || 0,
          sizeBytes: Number(parsed.size_bytes) || sizeBytes,
        });
      } catch {
        resolve({ ok: false, error: "corrupt", pageCount: 0 });
      }
    });
  });
}

export function httpStatusForValidation(code: ErrorCode): number {
  switch (code) {
    case "too_large":
      return 413;
    case "unsupported_type":
      return 415;
    case "too_many_pages":
    case "encrypted":
    case "corrupt":
    case "scan_detected":
      return 400;
    default:
      return 400;
  }
}

export function sizeBucketFor(bytes: number): string {
  if (bytes <= 256 * 1024) return "le_256kib";
  if (bytes <= 1024 * 1024) return "le_1mib";
  if (bytes <= 5 * 1024 * 1024) return "le_5mib";
  if (bytes <= MAX_UPLOAD_BYTES) return "le_10mib";
  return "over_limit";
}

export function pageBucketFor(pages: number): string {
  if (pages <= 0) return "0";
  if (pages <= 3) return "1_3";
  if (pages <= 5) return "4_5";
  return "over_5";
}
