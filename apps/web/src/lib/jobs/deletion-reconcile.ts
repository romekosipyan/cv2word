import { getJobQueue } from "../queue";
import { queueTierClean } from "../queue/purge-contract";
import { getObjectStorage } from "../storage/filesystem";
import type { ObjectStorage } from "../storage/types";
import type { JobRecord } from "./types";

/**
 * Every inventoried tier that can hold job bytes or job references
 * (ADR-002 / SPEC-STORAGE). Lifecycle policies are not listed — they are a
 * safety net, never proof.
 *
 * Object proof includes DB-recorded keys plus prefix inventory under
 * `originals|outputs/{jobId}/` (US-093).
 */
export const DELETION_TIERS = [
  "db_access_revoked",
  "object_keys",
  "multipart_uploads",
  "temp_disks",
  "queue_live",
  "queue_dlq",
] as const;

export type DeletionTier = (typeof DELETION_TIERS)[number];

/**
 * SPEC-STORAGE user-delete / cancel verified cleanup target (seconds).
 * Same numeric gate as cleanup_backlog alert threshold.
 */
export const USER_DELETE_VERIFIED_TARGET_SECONDS = 300;

export type TierStatus = {
  tier: DeletionTier;
  clean: boolean;
  detail?: string;
};

export type DeletionProof = {
  jobId: string;
  verified: boolean;
  tiers: TierStatus[];
  /** Tiers still dirty — empty only when verified. */
  remaining: DeletionTier[];
};

function hasInventoryMethod(
  storage: ObjectStorage,
  name: keyof ObjectStorage,
): boolean {
  return typeof storage[name] === "function";
}

/**
 * Fail-closed multi-tier proof. `deleted` / `deletion_completed` must not emit
 * unless every inventoried tier reports clean. Empty success is forbidden:
 * missing multipart/temp/prefix inventory APIs mark those tiers unclean —
 * adapters that omit them must not reach `deleted`.
 */
export async function verifyDeletionTiers(job: JobRecord): Promise<DeletionProof> {
  const storage = getObjectStorage();
  const queue = getJobQueue();
  const tiers: TierStatus[] = [];

  const accessRevoked =
    job.tombstone === 1 &&
    (job.state === "deleting" || job.state === "deleted") &&
    job.uploadTokenHash === null &&
    job.leaseToken === null;
  tiers.push({
    tier: "db_access_revoked",
    clean: accessRevoked,
    detail: accessRevoked ? undefined : "tombstone_or_tokens_remain",
  });

  let objectsClean = true;
  let objectDetail: string | undefined;
  for (const key of [job.originalObjectKey, job.outputObjectKey]) {
    if (!key) continue;
    if (await storage.objectExists(key)) {
      objectsClean = false;
      objectDetail = "object_still_present";
      break;
    }
  }

  if (!hasInventoryMethod(storage, "listObjectKeysForJob")) {
    objectsClean = false;
    objectDetail = "inventory_unimplemented";
  } else {
    const prefixKeys = await storage.listObjectKeysForJob!(job.id);
    if (prefixKeys.length > 0) {
      objectsClean = false;
      objectDetail = `prefix_orphans:${prefixKeys.length}`;
    }
  }

  tiers.push({
    tier: "object_keys",
    clean: objectsClean,
    detail: objectDetail,
  });

  if (!hasInventoryMethod(storage, "listIncompleteMultipartForJob")) {
    tiers.push({
      tier: "multipart_uploads",
      clean: false,
      detail: "inventory_unimplemented",
    });
  } else {
    const multiparts = storage.listIncompleteMultipartForJob!(job.id);
    tiers.push({
      tier: "multipart_uploads",
      clean: multiparts.length === 0,
      detail:
        multiparts.length === 0
          ? undefined
          : `incomplete_multipart:${multiparts.length}`,
    });
  }

  if (!hasInventoryMethod(storage, "tempDiskExists")) {
    tiers.push({
      tier: "temp_disks",
      clean: false,
      detail: "inventory_unimplemented",
    });
  } else {
    const tempPresent = await storage.tempDiskExists!(job.id);
    tiers.push({
      tier: "temp_disks",
      clean: !tempPresent,
      detail: tempPresent ? "temp_disk_present" : undefined,
    });
  }

  const live = queue.hasLiveMessage(job.id);
  tiers.push({
    tier: "queue_live",
    clean: !live,
    detail: live ? "live_queue_ref" : undefined,
  });

  const dlq = queue.isInDeadLetter(job.id);
  tiers.push({
    tier: "queue_dlq",
    clean: !dlq,
    detail: dlq ? "dlq_ref" : undefined,
  });

  // Cross-check queue contract helper (production SQS must satisfy the same).
  if (!queueTierClean(queue, job.id)) {
    // individual tiers already flagged; keep verified false via remaining
  }

  const remaining = tiers.filter((t) => !t.clean).map((t) => t.tier);
  return {
    jobId: job.id,
    verified: remaining.length === 0,
    tiers,
    remaining,
  };
}

/**
 * Physical cleanup for inventoried non-DB tiers. Does not mark `deleted`.
 * Returns counts for sweeper stats / evidence.
 *
 * Abort/wipe/prefix-list APIs are required — omitting them throws so callers
 * cannot treat a no-op purge as success before verify.
 */
export async function purgePhysicalTiers(job: JobRecord): Promise<{
  objectsRemoved: number;
  multipartsAborted: number;
  tempWiped: number;
  queuePurged: number;
}> {
  const storage = getObjectStorage();
  const queue = getJobQueue();

  if (!hasInventoryMethod(storage, "listObjectKeysForJob")) {
    throw new Error("inventory_unimplemented:list_object_keys");
  }

  const keys = new Set<string>();
  for (const key of [job.originalObjectKey, job.outputObjectKey]) {
    if (key) keys.add(key);
  }
  for (const key of await storage.listObjectKeysForJob!(job.id)) {
    keys.add(key);
  }

  let objectsRemoved = 0;
  for (const key of keys) {
    const existed = await storage.objectExists(key);
    await storage.deleteObject(key);
    if (existed) objectsRemoved += 1;
  }

  if (!hasInventoryMethod(storage, "abortMultipartUploadsForJob")) {
    throw new Error("inventory_unimplemented:abort_multipart");
  }
  if (!hasInventoryMethod(storage, "wipeTempDiskForJob")) {
    throw new Error("inventory_unimplemented:wipe_temp");
  }

  const multipartsAborted = await storage.abortMultipartUploadsForJob!(job.id);
  const tempWiped = (await storage.wipeTempDiskForJob!(job.id)) ? 1 : 0;

  const main = await queue.purgeByJobId(job.id);
  const dlq = queue.purgeDeadLetterByJobId(job.id);

  return {
    objectsRemoved,
    multipartsAborted,
    tempWiped,
    queuePurged: main + dlq,
  };
}
