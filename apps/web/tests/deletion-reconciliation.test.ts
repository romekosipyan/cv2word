import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { DELETE as deleteJob } from "@/app/api/jobs/[id]/route";
import {
  emitCleanupBacklogAlert,
  evaluateCleanupBacklog,
} from "@/lib/alerts/cleanup-backlog";
import { getConfig } from "@/lib/config";
import { resetDbForTests } from "@/lib/db";
import {
  DELETION_TIERS,
  purgePhysicalTiers,
  verifyDeletionTiers,
} from "@/lib/jobs/deletion-reconcile";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import {
  reconcileUserDeletion,
  runExpirySweeper,
  stopExpirySweeperForTests,
} from "@/lib/jobs/sweeper";
import {
  destinationOutputKey,
  getInMemoryJobQueue,
  QUEUE_PURGE_CONTRACT,
  queueTierClean,
  resetJobQueueForTests,
} from "@/lib/queue";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import {
  getObjectStorage,
  resetObjectStorageForTests,
} from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";
const FIXTURES = path.resolve(
  __dirname,
  "../../../workers/convert/inspect/fixtures",
);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us032-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
}

async function createAuthorizedJob(idempotencyKey: string): Promise<{
  id: string;
  secret: string;
  objectKey: string;
}> {
  const res = await createJob(
    new Request(`${ORIGIN}/api/jobs`, {
      method: "POST",
      headers: baseHeaders({
        "idempotency-key": idempotencyKey,
        "content-type": "application/json",
      }),
    }),
  );
  expect(res.status).toBe(201);
  const body = await res.json();
  return {
    id: body.id as string,
    secret: body.secret as string,
    objectKey: body.upload.objectKey as string,
  };
}

async function putGoodPdf(objectKey: string): Promise<void> {
  const bytes = fs.readFileSync(path.join(FIXTURES, "a4_text.pdf"));
  await getObjectStorage().putObject(objectKey, bytes);
}

async function complete(id: string, secret: string): Promise<Response> {
  return completeUpload(
    new Request(`${ORIGIN}/api/jobs/${id}/complete-upload`, {
      method: "POST",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function del(id: string, secret: string): Promise<Response> {
  return deleteJob(
    new Request(`${ORIGIN}/api/jobs/${id}`, {
      method: "DELETE",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("US-032 verified deletion reconciliation", () => {
  let root: string;

  beforeEach(() => {
    root = tempDir();
    process.env.DATABASE_PATH = path.join(root, "jobs.sqlite");
    process.env.STORAGE_ROOT = path.join(root, "objects");
    process.env.WORKER_TEMP_ROOT = path.join(root, "worker-temp");
    process.env.JOB_SECRET_PEPPER = "test-pepper";
    process.env.ALLOWED_ORIGINS = ORIGIN;
    process.env.COOKIE_SECURE = "false";
    process.env.FREE_QUOTA_PER_24H = "50";
    process.env.RATE_LIMIT_CREATE_MAX = "100";
    process.env.RATE_LIMIT_POLL_MAX = "100";
    process.env.RATE_LIMIT_DOWNLOAD_MAX = "100";
    process.env.JOB_ACCESS_TTL_SECONDS = "3600";
    process.env.CLEANUP_BACKLOG_ALERT_SECONDS = "300";
    process.env.VITEST = "true";
    resetDbForTests(process.env.DATABASE_PATH);
    resetObjectStorageForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    stopExpirySweeperForTests();
  });

  afterEach(() => {
    stopExpirySweeperForTests();
    resetDbForTests();
    resetJobQueueForTests();
    resetRateLimiterForTests();
    fs.rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("inventories all deletion tiers and lifecycle is documented as safety net only", () => {
    expect(DELETION_TIERS).toEqual([
      "db_access_revoked",
      "object_keys",
      "multipart_uploads",
      "temp_disks",
      "queue_live",
      "queue_dlq",
    ]);
    expect(QUEUE_PURGE_CONTRACT.safetyNetOnly).toContain("lifecycle_expire");
    expect(QUEUE_PURGE_CONTRACT.requiredBeforeDeleted).toContain("verify_empty");
    // Config default matches SPEC-STORAGE 5-minute cleanup target.
    expect(getConfig().cleanupBacklogAlertSeconds).toBe(300);
  });

  it("tombstone blocks storage putObject recreation after cancel", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-put");
    await putGoodPdf(objectKey);
    await complete(id, secret);
    const outputKey = destinationOutputKey(id);

    expect((await del(id, secret)).status).toBe(202);
    expect(findJobById(id)?.tombstone).toBe(1);

    await expect(
      getObjectStorage().putObject(objectKey, Buffer.from("%PDF-fake")),
    ).rejects.toThrow("tombstone_blocks_write");
    await expect(
      getObjectStorage().putObject(outputKey, Buffer.from("PK-recreate")),
    ).rejects.toThrow("tombstone_blocks_write");
    expect(() =>
      getObjectStorage().registerMultipartUpload({
        jobId: id,
        objectKey,
      }),
    ).toThrow("tombstone_blocks_write");

    expect(await getObjectStorage().objectExists(outputKey)).toBe(false);
  });

  it("fail-closed: missing multipart/temp inventory refuses deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-noinv");
    await putGoodPdf(objectKey);

    expect((await del(id, secret)).status).toBe(202);
    const storage = getObjectStorage() as unknown as Record<string, unknown>;
    // Simulate an incomplete adapter that omits inventoried-tier APIs
    // (own props shadow prototype methods).
    storage.listIncompleteMultipartForJob = undefined;
    storage.tempDiskExists = undefined;

    const proof = await verifyDeletionTiers(findJobById(id)!);
    expect(proof.verified).toBe(false);
    expect(proof.remaining).toEqual(
      expect.arrayContaining(["multipart_uploads", "temp_disks"]),
    );
    expect(
      proof.tiers.find((t) => t.tier === "multipart_uploads")?.detail,
    ).toBe("inventory_unimplemented");
    expect(proof.tiers.find((t) => t.tier === "temp_disks")?.detail).toBe(
      "inventory_unimplemented",
    );

    await reconcileUserDeletion(id);
    expect(findJobById(id)?.state).toBe("deleting");
  });

  it("fail-closed: missing purge inventory APIs refuse deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-nopurge");
    await putGoodPdf(objectKey);

    expect((await del(id, secret)).status).toBe(202);
    const storage = getObjectStorage() as unknown as Record<string, unknown>;
    storage.abortMultipartUploadsForJob = undefined;
    storage.wipeTempDiskForJob = undefined;

    await expect(purgePhysicalTiers(findJobById(id)!)).rejects.toThrow(
      /inventory_unimplemented/,
    );

    await reconcileUserDeletion(id);
    expect(findJobById(id)?.state).toBe("deleting");
  });

  it("reconciles multipart, temp disk, objects, and queue before deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-full");
    await putGoodPdf(objectKey);
    await complete(id, secret);
    const outputKey = destinationOutputKey(id);
    await getObjectStorage().putObject(outputKey, Buffer.from("PK-out"));
    updateJob(id, { state: "succeeded", outputObjectKey: outputKey });

    const uploadId = getObjectStorage().registerMultipartUpload({
      jobId: id,
      objectKey: `originals/${id}/source.pdf`,
    });
    expect(uploadId).toBeTruthy();
    expect(getObjectStorage().listIncompleteMultipartForJob(id)).toHaveLength(1);

    const tempPath = await getObjectStorage().registerTempDisk(id);
    expect(fs.existsSync(tempPath)).toBe(true);
    expect(await getObjectStorage().tempDiskExists(id)).toBe(true);

    await getInMemoryJobQueue().enqueue({
      jobId: id,
      outputObjectKey: outputKey,
    });
    expect(queueTierClean(getInMemoryJobQueue(), id)).toBe(false);

    expect((await del(id, secret)).status).toBe(202);
    expect(findJobById(id)?.state).toBe("deleting");

    await reconcileUserDeletion(id);

    const job = findJobById(id)!;
    expect(job.state).toBe("deleted");
    expect(job.originalObjectKey).toBeNull();
    expect(job.outputObjectKey).toBeNull();
    expect(await getObjectStorage().objectExists(objectKey)).toBe(false);
    expect(await getObjectStorage().objectExists(outputKey)).toBe(false);
    expect(getObjectStorage().listIncompleteMultipartForJob(id)).toHaveLength(0);
    expect(await getObjectStorage().tempDiskExists(id)).toBe(false);
    expect(queueTierClean(getInMemoryJobQueue(), id)).toBe(true);

    const proof = await verifyDeletionTiers({
      ...job,
      // Proof after deleted: access still revoked; keys already nulled.
      state: "deleted",
      tombstone: 1,
      uploadTokenHash: null,
      leaseToken: null,
    });
    expect(proof.verified).toBe(true);
    expect(proof.remaining).toEqual([]);
  });

  it("fail-closed: incomplete object cleanup refuses deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-obj");
    await putGoodPdf(objectKey);
    const storage = getObjectStorage();
    vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);

    expect((await del(id, secret)).status).toBe(202);
    await reconcileUserDeletion(id);

    expect(findJobById(id)?.state).toBe("deleting");
    expect(await storage.objectExists(objectKey)).toBe(true);
    const proof = await verifyDeletionTiers(findJobById(id)!);
    expect(proof.verified).toBe(false);
    expect(proof.remaining).toContain("object_keys");
  });

  it("fail-closed: leftover multipart refuses deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-mp");
    await putGoodPdf(objectKey);
    const storage = getObjectStorage();
    storage.registerMultipartUpload({
      jobId: id,
      objectKey,
    });
    vi.spyOn(storage, "abortMultipartUploadsForJob").mockResolvedValue(0);

    expect((await del(id, secret)).status).toBe(202);
    await reconcileUserDeletion(id);

    expect(findJobById(id)?.state).toBe("deleting");
    expect(storage.listIncompleteMultipartForJob(id).length).toBeGreaterThan(0);
    const proof = await verifyDeletionTiers(findJobById(id)!);
    expect(proof.remaining).toContain("multipart_uploads");
  });

  it("fail-closed: leftover temp disk refuses deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-temp");
    await putGoodPdf(objectKey);
    const storage = getObjectStorage();
    await storage.registerTempDisk(id);
    vi.spyOn(storage, "wipeTempDiskForJob").mockResolvedValue(false);

    expect((await del(id, secret)).status).toBe(202);
    await reconcileUserDeletion(id);

    expect(findJobById(id)?.state).toBe("deleting");
    expect(await storage.tempDiskExists(id)).toBe(true);
    const proof = await verifyDeletionTiers(findJobById(id)!);
    expect(proof.remaining).toContain("temp_disks");
  });

  it("fail-closed: live queue or DLQ refuses deleted", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-queue");
    await putGoodPdf(objectKey);
    expect((await complete(id, secret)).status).toBe(200);
    const queue = getInMemoryJobQueue();
    // Purge appears to run but leaves refs — production must not claim deleted.
    vi.spyOn(queue, "purgeByJobId").mockImplementation(async () => 0);
    vi.spyOn(queue, "purgeDeadLetterByJobId").mockImplementation(() => 0);
    vi.spyOn(queue, "hasLiveMessage").mockReturnValue(true);

    expect((await del(id, secret)).status).toBe(202);
    await reconcileUserDeletion(id);

    expect(findJobById(id)?.state).toBe("deleting");
    const proof = await verifyDeletionTiers(findJobById(id)!);
    expect(proof.remaining).toContain("queue_live");
    expect(queueTierClean(queue, id)).toBe(false);
  });

  it("emits cleanup_backlog when deleting jobs exceed threshold", async () => {
    const { id, secret, objectKey } = await createAuthorizedJob("us032-bl");
    await putGoodPdf(objectKey);
    const storage = getObjectStorage();
    vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);

    expect((await del(id, secret)).status).toBe(202);
    const stale = new Date(Date.now() - 400_000).toISOString();
    updateJob(id, { updatedAt: stale });

    const evaled = evaluateCleanupBacklog(new Date());
    expect(evaled.count).toBeGreaterThanOrEqual(1);
    expect(evaled.oldestJobId).toBe(id);
    expect(evaled.ageSeconds).toBeGreaterThanOrEqual(300);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alert = emitCleanupBacklogAlert(new Date());
    expect(alert.count).toBeGreaterThanOrEqual(1);

    const result = await runExpirySweeper(new Date());
    expect(result.cleanupBacklog).toBeGreaterThanOrEqual(1);
    expect(findJobById(id)?.state).toBe("deleting");

    const dumped = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toMatch(/cleanup_backlog/);
    expect(dumped).toContain(id);
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toMatch(/%PDF/);
  });

  it("deletion_completed logs omit secrets and resume text", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { id, secret, objectKey } = await createAuthorizedJob("us032-log");
    const pdfBytes = fs.readFileSync(path.join(FIXTURES, "a4_text.pdf"));
    await getObjectStorage().putObject(objectKey, pdfBytes);
    await getObjectStorage().registerTempDisk(id);
    getObjectStorage().registerMultipartUpload({ jobId: id, objectKey });

    await del(id, secret);
    await reconcileUserDeletion(id);
    expect(findJobById(id)?.state).toBe("deleted");

    const dumped = [...info.mock.calls, ...warn.mock.calls]
      .map((c) => c.map(String).join(" "))
      .join("\n");
    expect(dumped).toMatch(/deletion_completed/);
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain("Resume of");
    expect(dumped).not.toMatch(/%PDF/);
  });
});
