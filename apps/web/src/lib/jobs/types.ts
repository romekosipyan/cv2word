export type JobState =
  | "created"
  | "uploading"
  | "queued"
  | "processing"
  | "validating"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "deleting"
  | "deleted";

export const ACTIVE_JOB_STATES: readonly JobState[] = [
  "created",
  "uploading",
  "queued",
  "processing",
  "validating",
] as const;

export interface JobRecord {
  id: string;
  sessionId: string;
  tokenHash: string;
  idempotencyKey: string;
  state: JobState;
  originalObjectKey: string | null;
  outputObjectKey: string | null;
  sizeBucket: string | null;
  pageBucket: string | null;
  engineVersion: string | null;
  errorCode: string | null;
  warningsJson: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  tombstone: number;
  quotaCounted: number;
  uploadTokenHash: string | null;
  uploadTokenExpiresAt: string | null;
  /** Opaque lease bound to the current queue visibility window. */
  leaseToken: string | null;
  leaseExpiresAt: string | null;
}

export interface UploadAuthorization {
  method: "PUT";
  /** S3-shaped or local PUT target. May include short-lived signature query params; never the job bearer secret. */
  url: string;
  headers: Record<string, string>;
  objectKey: string;
  expiresAt: string;
}

export interface CreateJobResult {
  job: JobRecord;
  secret: string;
  upload: UploadAuthorization;
  reused: boolean;
}
