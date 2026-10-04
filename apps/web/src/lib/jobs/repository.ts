import { getDb } from "../db";
import type { JobRecord, JobState } from "./types";
import { ACTIVE_JOB_STATES } from "./types";

type JobRow = {
  id: string;
  session_id: string;
  token_hash: string;
  idempotency_key: string;
  state: string;
  original_object_key: string | null;
  output_object_key: string | null;
  size_bucket: string | null;
  page_bucket: string | null;
  engine_version: string | null;
  error_code: string | null;
  warnings_json: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  tombstone: number;
  quota_counted: number;
  upload_token_hash: string | null;
  upload_token_expires_at: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
};

function mapRow(row: JobRow): JobRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    tokenHash: row.token_hash,
    idempotencyKey: row.idempotency_key,
    state: row.state as JobState,
    originalObjectKey: row.original_object_key,
    outputObjectKey: row.output_object_key,
    sizeBucket: row.size_bucket,
    pageBucket: row.page_bucket,
    engineVersion: row.engine_version,
    errorCode: row.error_code,
    warningsJson: row.warnings_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    tombstone: row.tombstone,
    quotaCounted: row.quota_counted,
    uploadTokenHash: row.upload_token_hash,
    uploadTokenExpiresAt: row.upload_token_expires_at,
    leaseToken: row.lease_token ?? null,
    leaseExpiresAt: row.lease_expires_at ?? null,
  };
}

export function insertJob(job: JobRecord): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (
      id, session_id, token_hash, idempotency_key, state,
      original_object_key, output_object_key, size_bucket, page_bucket,
      engine_version, error_code, warnings_json, created_at, updated_at,
      expires_at, tombstone, quota_counted, upload_token_hash, upload_token_expires_at,
      lease_token, lease_expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    job.id,
    job.sessionId,
    job.tokenHash,
    job.idempotencyKey,
    job.state,
    job.originalObjectKey,
    job.outputObjectKey,
    job.sizeBucket,
    job.pageBucket,
    job.engineVersion,
    job.errorCode,
    job.warningsJson,
    job.createdAt,
    job.updatedAt,
    job.expiresAt,
    job.tombstone,
    job.quotaCounted,
    job.uploadTokenHash,
    job.uploadTokenExpiresAt,
    job.leaseToken,
    job.leaseExpiresAt,
  );
}

export function findJobById(id: string): JobRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM jobs WHERE id = ?`)
    .get(id) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function findJobByIdempotency(
  sessionId: string,
  idempotencyKey: string,
): JobRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE session_id = ? AND idempotency_key = ?`,
    )
    .get(sessionId, idempotencyKey) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function findActiveJobForSession(sessionId: string): JobRecord | null {
  const placeholders = ACTIVE_JOB_STATES.map(() => "?").join(", ");
  const row = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE session_id = ? AND state IN (${placeholders}) AND tombstone = 0 ORDER BY created_at DESC LIMIT 1`,
    )
    .get(sessionId, ...ACTIVE_JOB_STATES) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

/** Resolve an upload ticket when in-memory registration is unavailable (Next.js multi-module). */
export function findJobByUploadTokenHash(
  uploadTokenHash: string,
): JobRecord | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE upload_token_hash = ? AND tombstone = 0 LIMIT 1`,
    )
    .get(uploadTokenHash) as JobRow | undefined;
  return row ? mapRow(row) : null;
}

export function countQuotaJobsSince(sessionId: string, sinceIso: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM jobs WHERE session_id = ? AND quota_counted = 1 AND created_at >= ?`,
    )
    .get(sessionId, sinceIso) as { c: number };
  return row.c;
}

/** Oldest quota-counted job in the window — used for Retry-After on free quota. */
export function oldestQuotaJobCreatedAt(
  sessionId: string,
  sinceIso: string,
): string | null {
  const row = getDb()
    .prepare(
      `SELECT created_at FROM jobs
       WHERE session_id = ? AND quota_counted = 1 AND created_at >= ?
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(sessionId, sinceIso) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

/** Jobs whose access window has ended but are not yet fully deleted. */
export function findJobsExpiredBefore(nowIso: string): JobRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE expires_at <= ? AND state != 'deleted' ORDER BY expires_at ASC`,
    )
    .all(nowIso) as JobRow[];
  return rows.map(mapRow);
}

/** Jobs already tombstoned / deleting that still need physical cleanup. */
export function findJobsPendingDeletion(): JobRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs WHERE state = 'deleting' OR (tombstone = 1 AND state != 'deleted') ORDER BY updated_at ASC`,
    )
    .all() as JobRow[];
  return rows.map(mapRow);
}

/** Non-terminal jobs with an expired worker lease (US-012 → US-030). */
export function findJobsWithExpiredLeases(nowIso: string): JobRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE lease_expires_at IS NOT NULL
         AND lease_expires_at <= ?
         AND tombstone = 0
         AND state IN ('queued', 'processing', 'validating')
       ORDER BY lease_expires_at ASC`,
    )
    .all(nowIso) as JobRow[];
  return rows.map(mapRow);
}

/** In-flight conversion rows that may be stuck after DLQ (US-012 unlock). */
export function findInFlightConversionJobs(): JobRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM jobs
       WHERE tombstone = 0
         AND state IN ('processing', 'validating')
       ORDER BY updated_at ASC`,
    )
    .all() as JobRow[];
  return rows.map(mapRow);
}

export function updateJob(
  id: string,
  patch: Partial<{
    state: JobState;
    originalObjectKey: string | null;
    outputObjectKey: string | null;
    sizeBucket: string | null;
    pageBucket: string | null;
    engineVersion: string | null;
    errorCode: string | null;
    warningsJson: string;
    expiresAt: string;
    tombstone: number;
    quotaCounted: number;
    uploadTokenHash: string | null;
    uploadTokenExpiresAt: string | null;
    leaseToken: string | null;
    leaseExpiresAt: string | null;
    updatedAt: string;
  }>,
): JobRecord | null {
  const current = findJobById(id);
  if (!current) return null;
  const next: JobRecord = {
    ...current,
    state: patch.state ?? current.state,
    originalObjectKey:
      patch.originalObjectKey !== undefined
        ? patch.originalObjectKey
        : current.originalObjectKey,
    outputObjectKey:
      patch.outputObjectKey !== undefined
        ? patch.outputObjectKey
        : current.outputObjectKey,
    sizeBucket:
      patch.sizeBucket !== undefined ? patch.sizeBucket : current.sizeBucket,
    pageBucket:
      patch.pageBucket !== undefined ? patch.pageBucket : current.pageBucket,
    engineVersion:
      patch.engineVersion !== undefined
        ? patch.engineVersion
        : current.engineVersion,
    errorCode:
      patch.errorCode !== undefined ? patch.errorCode : current.errorCode,
    warningsJson: patch.warningsJson ?? current.warningsJson,
    expiresAt: patch.expiresAt ?? current.expiresAt,
    tombstone: patch.tombstone ?? current.tombstone,
    quotaCounted: patch.quotaCounted ?? current.quotaCounted,
    uploadTokenHash:
      patch.uploadTokenHash !== undefined
        ? patch.uploadTokenHash
        : current.uploadTokenHash,
    uploadTokenExpiresAt:
      patch.uploadTokenExpiresAt !== undefined
        ? patch.uploadTokenExpiresAt
        : current.uploadTokenExpiresAt,
    leaseToken:
      patch.leaseToken !== undefined ? patch.leaseToken : current.leaseToken,
    leaseExpiresAt:
      patch.leaseExpiresAt !== undefined
        ? patch.leaseExpiresAt
        : current.leaseExpiresAt,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE jobs SET
        state = ?, original_object_key = ?, output_object_key = ?,
        size_bucket = ?, page_bucket = ?, engine_version = ?, error_code = ?,
        warnings_json = ?, expires_at = ?, tombstone = ?, quota_counted = ?,
        upload_token_hash = ?, upload_token_expires_at = ?,
        lease_token = ?, lease_expires_at = ?, updated_at = ?
      WHERE id = ?`,
    )
    .run(
      next.state,
      next.originalObjectKey,
      next.outputObjectKey,
      next.sizeBucket,
      next.pageBucket,
      next.engineVersion,
      next.errorCode,
      next.warningsJson,
      next.expiresAt,
      next.tombstone,
      next.quotaCounted,
      next.uploadTokenHash,
      next.uploadTokenExpiresAt,
      next.leaseToken,
      next.leaseExpiresAt,
      next.updatedAt,
      id,
    );

  return next;
}
