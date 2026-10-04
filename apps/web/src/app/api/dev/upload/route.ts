import { getConfig } from "@/lib/config";
import { hashSecret } from "@/lib/crypto";
import { jsonError } from "@/lib/errors";
import { handleRouteError, withNoStore } from "@/lib/http/response";
import { findJobByUploadTokenHash } from "@/lib/jobs/repository";
import { getObjectStorage } from "@/lib/storage/filesystem";

export const runtime = "nodejs";

/**
 * Local-dev stand-in for S3 presigned PUT.
 * Auth is a short-lived upload token in the Authorization header — not the job bearer secret.
 * Prefer in-memory ticket; fall back to hashed token in SQLite (survives Next.js module splits).
 */
export async function PUT(request: Request): Promise<Response> {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const match = /^Upload\s+(.+)$/i.exec(auth.trim());
    if (!match?.[1]) {
      return jsonError("unauthorized", 401);
    }
    const token = match[1].trim();
    const storage = getObjectStorage();
    let objectKey: string | null = null;

    const ticket = storage.consumeUploadToken(token);
    if (ticket) {
      objectKey = ticket.objectKey;
    } else {
      const job = findJobByUploadTokenHash(hashSecret(token));
      if (
        !job?.originalObjectKey ||
        !job.uploadTokenExpiresAt ||
        new Date(job.uploadTokenExpiresAt).getTime() < Date.now()
      ) {
        return jsonError("unauthorized", 401);
      }
      if (job.state !== "uploading" && job.state !== "created") {
        return jsonError("unauthorized", 401);
      }
      objectKey = job.originalObjectKey;
    }

    const buf = Buffer.from(await request.arrayBuffer());
    const { maxUploadBytes } = getConfig();
    if (buf.byteLength > maxUploadBytes) {
      return jsonError("too_large", 413);
    }
    if (buf.byteLength === 0) {
      return jsonError("corrupt", 400);
    }

    // Soft type gate only — deep PDF validation is US-002.
    const contentType = request.headers.get("content-type") ?? "";
    if (
      contentType &&
      !contentType.includes("pdf") &&
      contentType !== "application/octet-stream"
    ) {
      return jsonError("unsupported_type", 415);
    }

    await storage.putObject(objectKey, buf, contentType || undefined);
    storage.invalidateUploadToken(token);

    return new Response(null, { status: 204, headers: withNoStore() });
  } catch (err) {
    return handleRouteError(err);
  }
}
