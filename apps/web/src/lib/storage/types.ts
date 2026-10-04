import type { UploadAuthorization } from "../jobs/types";

export type IncompleteMultipart = {
  uploadId: string;
  objectKey: string;
  jobId: string;
};

export interface ObjectStorage {
  createUploadAuthorization(input: {
    jobId: string;
    objectKey: string;
    uploadToken: string;
    expiresAt: Date;
    publicBaseUrl: string;
  }): UploadAuthorization;

  objectExists(objectKey: string): Promise<boolean>;

  /** Byte length of an object, or null if missing. */
  getObjectSize?(objectKey: string): Promise<number | null>;

  /** Absolute local path when the adapter stores on disk (dev filesystem). */
  getLocalPath?(objectKey: string): string | null;

  /**
   * Write object bytes. Must fail closed when the owning job is tombstoned
   * (US-032: cancelled workers cannot recreate files).
   */
  putObject(objectKey: string, body: Buffer, contentType?: string): Promise<void>;

  getObject(objectKey: string): Promise<Buffer | null>;

  deleteObject(objectKey: string): Promise<void>;

  /**
   * List object keys under `originals|{outputs}/{jobId}/` (US-093).
   * Required for verified deletion — DB key pair alone is not enough when
   * workers leave prefix orphans. Omit at runtime → verify fails closed.
   */
  listObjectKeysForJob(jobId: string): Promise<string[]>;

  /** Consume a one-shot local upload token (filesystem adapter). */
  consumeUploadToken?(token: string): {
    jobId: string;
    objectKey: string;
    expiresAt: Date;
  } | null;

  registerUploadToken?(input: {
    token: string;
    jobId: string;
    objectKey: string;
    expiresAt: Date;
  }): void;

  /**
   * Incomplete multipart inventory (S3 CreateMultipartUpload stand-in).
   * Lifecycle abort rules are a safety net — sweeper must abort + verify.
   * Registration helpers may be adapter-local; inventory + abort are required
   * so deletion cannot treat a missing API as clean (US-032).
   */
  registerMultipartUpload?(input: {
    jobId: string;
    objectKey: string;
    uploadId?: string;
  }): string;

  /** Required inventoried tier — omit at runtime → verify fails closed. */
  listIncompleteMultipartForJob(jobId: string): IncompleteMultipart[];

  /** Required purge path — omit at runtime → purge throws. */
  abortMultipartUploadsForJob(jobId: string): Promise<number>;

  /**
   * Per-job worker temp disk (tmpfs stand-in). Lifecycle does not cover it.
   */
  registerTempDisk?(jobId: string, relativePath?: string): Promise<string>;

  /** Required inventoried tier — omit at runtime → verify fails closed. */
  tempDiskExists(jobId: string): Promise<boolean>;

  /** Required purge path — omit at runtime → purge throws. */
  wipeTempDiskForJob(jobId: string): Promise<boolean>;
}
