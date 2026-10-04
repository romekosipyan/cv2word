/**
 * US-093 — Deletion lifecycle fixtures (Deletion Contract matrix).
 *
 * Acceptance Criteria item 4: delete during processing → access revoked, no
 * result republished, every derivative removed within the tested target.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE as deleteJob } from "@/app/api/jobs/[id]/route";
import { GET as downloadJob } from "@/app/api/jobs/[id]/download/route";
import {
  emitCleanupBacklogAlert,
  evaluateCleanupBacklog,
} from "@/lib/alerts/cleanup-backlog";
import { getConfig } from "@/lib/config";
import { resetDbForTests } from "@/lib/db";
import {
  USER_DELETE_VERIFIED_TARGET_SECONDS,
  verifyDeletionTiers,
} from "@/lib/jobs/deletion-reconcile";
import {
  acquireWorkerLease,
  publishWorkerState,
} from "@/lib/jobs/lease";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import {
  reconcileUserDeletion,
  runExpirySweeper,
  stopExpirySweeperForTests,
} from "@/lib/jobs/sweeper";
import { processOneSimulatedJob } from "@/lib/jobs/worker-sim";
import {
  destinationOutputKey,
  getInMemoryJobQueue,
  queueTierClean,
  resetJobQueueForTests,
} from "@/lib/queue";
import { resetRateLimiterForTests } from "@/lib/ratelimit";
import {
  getObjectStorage,
  resetObjectStorageForTests,
} from "@/lib/storage/filesystem";

import {
  LIFECYCLE_PHASES,
  seedLifecycleFixture,
  type LifecyclePhase,
} from "./helpers/deletion-lifecycle-fixtures";

const ORIGIN = "http://localhost:3000";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rtw-us093-"));
}

function baseHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set("origin", ORIGIN);
  return h;
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

async function assertVerifiedDeleted(
  id: string,
  objectKey: string,
  orphanKeys: string[],
  outputKey: string,
): Promise<void> {
  const job = findJobById(id)!;
  expect(job.state).toBe("deleted");
  expect(job.tombstone).toBe(1);
  expect(job.originalObjectKey).toBeNull();
  expect(job.outputObjectKey).toBeNull();
  expect(job.leaseToken).toBeNull();

  const storage = getObjectStorage();
  expect(await storage.objectExists(objectKey)).toBe(false);
  expect(await storage.objectExists(outputKey)).toBe(false);
  for (const key of orphanKeys) {
    expect(await storage.objectExists(key)).toBe(false);
  }
  expect(await storage.listObjectKeysForJob(id)).toEqual([]);
  expect(storage.listIncompleteMultipartForJob(id)).toHaveLength(0);
  expect(await storage.tempDiskExists(id)).toBe(false);
  expect(queueTierClean(getInMemoryJobQueue(), id)).toBe(true);

  const proof = await verifyDeletionTiers({
    ...job,
    state: "deleted",
    tombstone: 1,
    uploadTokenHash: null,
    leaseToken: null,
  });
  expect(proof.verified).toBe(true);
  expect(proof.remaining).toEqual([]);
}

describe("US-093 deletion lifecycle fixtures", () => {
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
    process.env.CLEANUP_BACKLOG_ALERT_SECONDS = String(
      USER_DELETE_VERIFIED_TARGET_SECONDS,
    );
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

  it("covers the Deletion Contract lifecycle matrix", () => {
    expect(LIFECYCLE_PHASES).toEqual([
      "queued",
      "running",
      "downloading",
      "failed",
      "crashed",
    ]);
    expect(getConfig().cleanupBacklogAlertSeconds).toBe(
      USER_DELETE_VERIFIED_TARGET_SECONDS,
    );
  });

  it.each(LIFECYCLE_PHASES)(
    "fixture %s reaches verified deletion within tested target",
    async (phase: LifecyclePhase) => {
      const fixture = await seedLifecycleFixture(phase);
      const started = Date.now();

      expect((await del(fixture.id, fixture.secret)).status).toBe(202);
      expect(findJobById(fixture.id)?.state).toBe("deleting");
      expect(findJobById(fixture.id)?.tombstone).toBe(1);
      expect(findJobById(fixture.id)?.leaseToken).toBeNull();

      await reconcileUserDeletion(fixture.id);

      const elapsedMs = Date.now() - started;
      expect(elapsedMs).toBeLessThan(
        USER_DELETE_VERIFIED_TARGET_SECONDS * 1000,
      );

      await assertVerifiedDeleted(
        fixture.id,
        fixture.objectKey,
        fixture.orphanKeys,
        fixture.outputKey,
      );
    },
  );

  it("delete during running: no result republished; tombstone blocks worker", async () => {
    const fixture = await seedLifecycleFixture("running", "us093-republish");
    const priorLease = fixture.leaseToken!;
    expect(priorLease).toBeTruthy();

    expect((await del(fixture.id, fixture.secret)).status).toBe(202);
    expect(findJobById(fixture.id)?.state).toBe("deleting");

    const republish = publishWorkerState(fixture.id, priorLease, {
      state: "succeeded",
      outputObjectKey: fixture.outputKey,
      engineVersion: "sim-evil",
    });
    expect(republish.ok).toBe(false);
    if (!republish.ok) expect(republish.reason).toBe("tombstone");

    await expect(
      getObjectStorage().putObject(
        fixture.outputKey,
        Buffer.from("PK-republish"),
      ),
    ).rejects.toThrow("tombstone_blocks_write");

    const sim = await processOneSimulatedJob(async () => ({
      ok: true,
      engineVersion: "sim-evil",
    }));
    if (sim.handled) {
      expect(sim.outcome).not.toBe("succeeded");
    }

    expect(findJobById(fixture.id)?.state).toBe("deleting");
    expect(findJobById(fixture.id)?.state).not.toBe("succeeded");

    await reconcileUserDeletion(fixture.id);
    await assertVerifiedDeleted(
      fixture.id,
      fixture.objectKey,
      fixture.orphanKeys,
      fixture.outputKey,
    );
  });

  it("delete during downloading revokes access and clears derivatives", async () => {
    const fixture = await seedLifecycleFixture(
      "downloading",
      "us093-download-del",
    );

    const before = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${fixture.id}/download`, {
        method: "GET",
        headers: baseHeaders({
          authorization: `Bearer ${fixture.secret}`,
        }),
      }),
      { params: Promise.resolve({ id: fixture.id }) },
    );
    expect(before.status).toBe(200);

    expect((await del(fixture.id, fixture.secret)).status).toBe(202);

    // Download route remaps delete_pending → neutral unavailable (no bytes).
    const after = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${fixture.id}/download`, {
        method: "GET",
        headers: baseHeaders({
          authorization: `Bearer ${fixture.secret}`,
        }),
      }),
      { params: Promise.resolve({ id: fixture.id }) },
    );
    expect(after.status).toBe(404);
    expect(await after.json()).toEqual({ error: "unauthorized" });

    await reconcileUserDeletion(fixture.id);
    await assertVerifiedDeleted(
      fixture.id,
      fixture.objectKey,
      fixture.orphanKeys,
      fixture.outputKey,
    );

    const gone = await downloadJob(
      new Request(`${ORIGIN}/api/jobs/${fixture.id}/download`, {
        method: "GET",
        headers: baseHeaders({
          authorization: `Bearer ${fixture.secret}`,
        }),
      }),
      { params: Promise.resolve({ id: fixture.id }) },
    );
    // Download always returns neutral 404 unauthorized (no existence oracle).
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "unauthorized" });
  });

  it("prefix orphan without DB key refuses deleted until purged", async () => {
    const fixture = await seedLifecycleFixture("failed", "us093-orphan");
    expect((await del(fixture.id, fixture.secret)).status).toBe(202);

    const storage = getObjectStorage();
    const originalDelete = storage.deleteObject.bind(storage);
    vi.spyOn(storage, "deleteObject").mockImplementation(async (key) => {
      // Leave one prefix orphan on disk so verify must fail closed.
      if (key === fixture.orphanKeys[0]) return;
      await originalDelete(key);
    });

    await reconcileUserDeletion(fixture.id);
    expect(findJobById(fixture.id)?.state).toBe("deleting");
    const proof = await verifyDeletionTiers(findJobById(fixture.id)!);
    expect(proof.verified).toBe(false);
    expect(proof.remaining).toContain("object_keys");
    expect(
      proof.tiers.find((t) => t.tier === "object_keys")?.detail,
    ).toMatch(/prefix_orphans/);
  });

  it("fail-closed: missing prefix inventory refuses deleted", async () => {
    const fixture = await seedLifecycleFixture("queued", "us093-no-prefix");
    expect((await del(fixture.id, fixture.secret)).status).toBe(202);

    const storage = getObjectStorage() as unknown as Record<string, unknown>;
    storage.listObjectKeysForJob = undefined;

    const proof = await verifyDeletionTiers(findJobById(fixture.id)!);
    expect(proof.verified).toBe(false);
    expect(proof.remaining).toContain("object_keys");
    expect(
      proof.tiers.find((t) => t.tier === "object_keys")?.detail,
    ).toBe("inventory_unimplemented");

    await reconcileUserDeletion(fixture.id);
    expect(findJobById(fixture.id)?.state).toBe("deleting");
  });

  it("exercises cleanup_backlog when lifecycle cleanup stalls past target", async () => {
    const fixture = await seedLifecycleFixture("crashed", "us093-backlog");
    const storage = getObjectStorage();
    vi.spyOn(storage, "deleteObject").mockResolvedValue(undefined);

    expect((await del(fixture.id, fixture.secret)).status).toBe(202);
    const stale = new Date(
      Date.now() - (USER_DELETE_VERIFIED_TARGET_SECONDS + 100) * 1000,
    ).toISOString();
    updateJob(fixture.id, { updatedAt: stale });

    const evaled = evaluateCleanupBacklog(new Date());
    expect(evaled.count).toBeGreaterThanOrEqual(1);
    expect(evaled.oldestJobId).toBe(fixture.id);
    expect(evaled.ageSeconds).toBeGreaterThanOrEqual(
      USER_DELETE_VERIFIED_TARGET_SECONDS,
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alert = emitCleanupBacklogAlert(new Date());
    expect(alert.count).toBeGreaterThanOrEqual(1);

    const result = await runExpirySweeper(new Date());
    expect(result.cleanupBacklog).toBeGreaterThanOrEqual(1);
    expect(findJobById(fixture.id)?.state).toBe("deleting");

    const dumped = warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(dumped).toMatch(/cleanup_backlog/);
    expect(dumped).toContain(fixture.id);
    expect(dumped).not.toContain(fixture.secret);
    expect(dumped).not.toMatch(/%PDF/);
  });

  it("crashed fixture: expired lease cannot republish after delete", async () => {
    const fixture = await seedLifecycleFixture("crashed", "us093-crash-lease");
    expect((await del(fixture.id, fixture.secret)).status).toBe(202);

    const reacquire = acquireWorkerLease(
      fixture.id,
      new Date(Date.now() + 60_000),
    );
    expect(reacquire.ok).toBe(false);
    if (!reacquire.ok) expect(reacquire.reason).toBe("tombstone");

    if (fixture.leaseToken) {
      const blocked = publishWorkerState(fixture.id, fixture.leaseToken, {
        state: "succeeded",
        outputObjectKey: destinationOutputKey(fixture.id),
      });
      expect(blocked.ok).toBe(false);
    }

    await reconcileUserDeletion(fixture.id);
    await assertVerifiedDeleted(
      fixture.id,
      fixture.objectKey,
      fixture.orphanKeys,
      fixture.outputKey,
    );
  });
});
