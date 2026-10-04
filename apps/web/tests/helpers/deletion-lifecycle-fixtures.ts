/**
 * US-093 deletion lifecycle fixtures.
 *
 * Seeds jobs in queued / running / downloading / failed / crashed states with
 * representative derivatives (objects, prefix orphans, multipart, temp, queue)
 * so verified deletion can be exercised per Deletion Contract matrix.
 */
import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";

import { POST as createJob } from "@/app/api/jobs/route";
import { POST as completeUpload } from "@/app/api/jobs/[id]/complete-upload/route";
import { acquireWorkerLease } from "@/lib/jobs/lease";
import { findJobById, updateJob } from "@/lib/jobs/repository";
import type { JobRecord } from "@/lib/jobs/types";
import {
  destinationOutputKey,
  getInMemoryJobQueue,
} from "@/lib/queue";
import {
  getObjectStorage,
} from "@/lib/storage/filesystem";

const ORIGIN = "http://localhost:3000";
const FIXTURES = path.resolve(
  __dirname,
  "../../../../workers/convert/inspect/fixtures",
);

export const LIFECYCLE_PHASES = [
  "queued",
  "running",
  "downloading",
  "failed",
  "crashed",
] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

export type LifecycleFixture = {
  phase: LifecyclePhase;
  id: string;
  secret: string;
  objectKey: string;
  outputKey: string;
  /** Keys under job prefixes that may not be on the DB row. */
  orphanKeys: string[];
  leaseToken: string | null;
  job: JobRecord;
};

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

async function complete(id: string, secret: string): Promise<void> {
  const res = await completeUpload(
    new Request(`${ORIGIN}/api/jobs/${id}/complete-upload`, {
      method: "POST",
      headers: baseHeaders({ authorization: `Bearer ${secret}` }),
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(res.status).toBe(200);
}

async function seedCommonDerivatives(
  id: string,
  objectKey: string,
): Promise<{ orphanKeys: string[]; outputKey: string }> {
  const storage = getObjectStorage();
  const outputKey = destinationOutputKey(id);
  const orphanKeys = [
    `originals/${id}/.partial-upload.bin`,
    `outputs/${id}/work-scratch.tmp`,
  ];
  for (const key of orphanKeys) {
    await storage.putObject(key, Buffer.from(`orphan:${id}`));
  }
  storage.registerMultipartUpload({
    jobId: id,
    objectKey: `originals/${id}/multipart-part.pdf`,
  });
  await storage.registerTempDisk(id);
  // Ensure the canonical original remains present for inventory.
  expect(await storage.objectExists(objectKey)).toBe(true);
  return { orphanKeys, outputKey };
}

/**
 * Build a job stopped at a Deletion Contract lifecycle phase, with derivatives
 * that reconcile must clear before `deleted`.
 */
export async function seedLifecycleFixture(
  phase: LifecyclePhase,
  idempotencyKey = `us093-${phase}`,
): Promise<LifecycleFixture> {
  const { id, secret, objectKey } = await createAuthorizedJob(idempotencyKey);
  await putGoodPdf(objectKey);
  await complete(id, secret);

  const { orphanKeys, outputKey } = await seedCommonDerivatives(id, objectKey);
  const storage = getObjectStorage();
  let leaseToken: string | null = null;

  switch (phase) {
    case "queued": {
      expect(findJobById(id)?.state).toBe("queued");
      expect(getInMemoryJobQueue().hasLiveMessage(id)).toBe(true);
      break;
    }
    case "running": {
      const acquired = acquireWorkerLease(id, new Date(Date.now() + 120_000));
      expect(acquired.ok).toBe(true);
      if (!acquired.ok) throw new Error("lease_failed");
      leaseToken = acquired.leaseToken;
      // Partial worker write not yet sticky on the row.
      await storage.putObject(outputKey, Buffer.from("PK-partial-running"));
      expect(findJobById(id)?.state).toBe("processing");
      break;
    }
    case "downloading": {
      await storage.putObject(outputKey, Buffer.from("PK-docx-download"));
      updateJob(id, {
        state: "succeeded",
        outputObjectKey: outputKey,
        engineVersion: "sim-0",
        leaseToken: null,
        leaseExpiresAt: null,
      });
      // Queue may still hold a ghost after success in abusive/race cases.
      expect(findJobById(id)?.state).toBe("succeeded");
      break;
    }
    case "failed": {
      await storage.putObject(outputKey, Buffer.from("PK-failed-scratch"));
      updateJob(id, {
        state: "failed",
        errorCode: "output_invalid",
        outputObjectKey: outputKey,
        leaseToken: null,
        leaseExpiresAt: null,
      });
      break;
    }
    case "crashed": {
      const acquired = acquireWorkerLease(id, new Date(Date.now() + 120_000));
      expect(acquired.ok).toBe(true);
      if (!acquired.ok) throw new Error("lease_failed");
      leaseToken = acquired.leaseToken;
      updateJob(id, { state: "validating" });
      // Crash left an orphan DOCX without publishing succeeded.
      await storage.putObject(
        `outputs/${id}/crash-partial.docx`,
        Buffer.from("PK-crash"),
      );
      orphanKeys.push(`outputs/${id}/crash-partial.docx`);
      expect(findJobById(id)?.state).toBe("validating");
      expect(findJobById(id)?.leaseToken).toBeTruthy();
      break;
    }
    default: {
      const _exhaustive: never = phase;
      throw new Error(`unknown_phase:${_exhaustive}`);
    }
  }

  const job = findJobById(id)!;
  return {
    phase,
    id,
    secret,
    objectKey,
    outputKey,
    orphanKeys,
    leaseToken,
    job,
  };
}
