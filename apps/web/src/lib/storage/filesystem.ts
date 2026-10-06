import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config";
import { findJobById } from "../jobs/repository";
import type { UploadAuthorization } from "../jobs/types";
import { jobIdFromObjectKey, jobObjectPrefixes } from "./keys";
import type { IncompleteMultipart, ObjectStorage } from "./types";

type UploadTicket = {
  jobId: string;
  objectKey: string;
  expiresAt: Date;
};

type MultipartEntry = IncompleteMultipart;

/**
 * Local-dev / MinIO-shaped adapter. Production will swap for S3-presigned PUT.
 * Upload tokens travel in Authorization headers — never the job bearer secret.
 *
 * US-032: multipart + temp-disk inventory, tombstone-blocked writes.
 * S3 lifecycle abort/expire rules are a safety net only — not proof of deletion.
 */
export class FilesystemObjectStorage implements ObjectStorage {
  private readonly tickets = new Map<string, UploadTicket>();
  private readonly multiparts = new Map<string, MultipartEntry>();
  private readonly tempRoots = new Map<string, string>();

  constructor(
    private readonly root = getConfig().storageRoot,
    private readonly tempRoot = getConfig().workerTempRoot,
  ) {}

  private resolve(objectKey: string): string {
    const full = path.resolve(this.root, objectKey);
    const rootResolved = path.resolve(this.root);
    if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
      throw new Error("invalid_object_key");
    }
    return full;
  }

  private assertWritable(objectKey: string): void {
    const jobId = jobIdFromObjectKey(objectKey);
    if (!jobId) return;
    const job = findJobById(jobId);
    if (job && job.tombstone === 1) {
      throw new Error("tombstone_blocks_write");
    }
  }

  registerUploadToken(input: {
    token: string;
    jobId: string;
    objectKey: string;
    expiresAt: Date;
  }): void {
    this.tickets.set(input.token, {
      jobId: input.jobId,
      objectKey: input.objectKey,
      expiresAt: input.expiresAt,
    });
  }

  consumeUploadToken(token: string): UploadTicket | null {
    const ticket = this.tickets.get(token);
    if (!ticket) return null;
    if (ticket.expiresAt.getTime() < Date.now()) {
      this.tickets.delete(token);
      return null;
    }
    // Keep until successful put so retries work within TTL; delete after put in route.
    return ticket;
  }

  invalidateUploadToken(token: string): void {
    this.tickets.delete(token);
  }

  createUploadAuthorization(input: {
    jobId: string;
    objectKey: string;
    uploadToken: string;
    expiresAt: Date;
    publicBaseUrl: string;
  }): UploadAuthorization {
    this.registerUploadToken({
      token: input.uploadToken,
      jobId: input.jobId,
      objectKey: input.objectKey,
      expiresAt: input.expiresAt,
    });
    const base = input.publicBaseUrl.replace(/\/$/, "");
    return {
      method: "PUT",
      url: `${base}/api/dev/upload`,
      headers: {
        Authorization: `Upload ${input.uploadToken}`,
        "Content-Type": "application/pdf",
      },
      objectKey: input.objectKey,
      expiresAt: input.expiresAt.toISOString(),
    };
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(objectKey));
      return true;
    } catch {
      return false;
    }
  }

  async getObjectSize(objectKey: string): Promise<number | null> {
    try {
      const st = await fs.stat(this.resolve(objectKey));
      return st.size;
    } catch {
      return null;
    }
  }

  getLocalPath(objectKey: string): string | null {
    try {
      return this.resolve(objectKey);
    } catch {
      return null;
    }
  }

  async putObject(objectKey: string, body: Buffer): Promise<void> {
    this.assertWritable(objectKey);
    const full = this.resolve(objectKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async getObject(objectKey: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(objectKey));
    } catch {
      return null;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(objectKey));
    } catch {
      // already gone
    }
  }

  /**
   * Prefix inventory under originals|outputs/{jobId}/ (US-093).
   * Catches orphans not recorded on the job row.
   */
  async listObjectKeysForJob(jobId: string): Promise<string[]> {
    const found: string[] = [];
    for (const prefix of jobObjectPrefixes(jobId)) {
      const dir = this.resolve(prefix);
      await this.collectKeysUnder(dir, prefix, found);
    }
    return found;
  }

  private async collectKeysUnder(
    dir: string,
    keyPrefix: string,
    out: string[],
  ): Promise<void> {
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childPath = path.join(dir, entry.name);
      const childKey = `${keyPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await this.collectKeysUnder(childPath, childKey, out);
      } else if (entry.isFile()) {
        out.push(childKey.replace(/\\/g, "/"));
      }
    }
  }

  registerMultipartUpload(input: {
    jobId: string;
    objectKey: string;
    uploadId?: string;
  }): string {
    // Same fail-closed gate as putObject — tombstone must block recreation.
    this.assertWritable(input.objectKey);
    const job = findJobById(input.jobId);
    if (job && job.tombstone === 1) {
      throw new Error("tombstone_blocks_write");
    }
    const uploadId = input.uploadId ?? randomBytes(12).toString("hex");
    this.multiparts.set(uploadId, {
      uploadId,
      jobId: input.jobId,
      objectKey: input.objectKey,
    });
    return uploadId;
  }

  listIncompleteMultipartForJob(jobId: string): IncompleteMultipart[] {
    return [...this.multiparts.values()].filter((m) => m.jobId === jobId);
  }

  async abortMultipartUploadsForJob(jobId: string): Promise<number> {
    let n = 0;
    for (const [id, entry] of this.multiparts) {
      if (entry.jobId !== jobId) continue;
      this.multiparts.delete(id);
      n += 1;
    }
    return n;
  }

  private tempPathFor(jobId: string, relativePath = "work"): string {
    const full = path.resolve(this.tempRoot, jobId, relativePath);
    const rootResolved = path.resolve(this.tempRoot);
    if (!full.startsWith(rootResolved + path.sep) && full !== rootResolved) {
      throw new Error("invalid_temp_path");
    }
    return full;
  }

  async registerTempDisk(
    jobId: string,
    relativePath = "work",
  ): Promise<string> {
    const full = this.tempPathFor(jobId, relativePath);
    await fs.mkdir(full, { recursive: true });
    // Marker file so existence is observable after empty-dir edge cases.
    await fs.writeFile(path.join(full, ".rtw-temp"), jobId, "utf8");
    this.tempRoots.set(jobId, path.resolve(this.tempRoot, jobId));
    return full;
  }

  async tempDiskExists(jobId: string): Promise<boolean> {
    const root = this.tempRoots.get(jobId) ?? path.resolve(this.tempRoot, jobId);
    try {
      await fs.access(root);
      return true;
    } catch {
      return false;
    }
  }

  async wipeTempDiskForJob(jobId: string): Promise<boolean> {
    const root = this.tempRoots.get(jobId) ?? path.resolve(this.tempRoot, jobId);
    let existed = false;
    try {
      await fs.access(root);
      existed = true;
    } catch {
      existed = false;
    }
    if (existed) {
      await fs.rm(root, { recursive: true, force: true });
    }
    this.tempRoots.delete(jobId);
    return existed;
  }
}

let storageSingleton: FilesystemObjectStorage | null = null;

export function getObjectStorage(): FilesystemObjectStorage {
  if (!storageSingleton) {
    storageSingleton = new FilesystemObjectStorage();
  }
  return storageSingleton;
}

export function resetObjectStorageForTests(): void {
  storageSingleton = new FilesystemObjectStorage(
    process.env.STORAGE_ROOT ?? getConfig().storageRoot,
    process.env.WORKER_TEMP_ROOT ?? getConfig().workerTempRoot,
  );
}
