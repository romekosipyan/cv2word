import { messageForErrorCode } from "./messages";

export type UploadAuthorization = {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  objectKey: string;
  expiresAt: string;
};

export type CreateJobResponse = {
  id: string;
  state: string;
  expiresAt: string;
  secret?: string;
  upload: UploadAuthorization;
};

export type JobStatusResponse = {
  id: string;
  state: string;
  stage?: string;
  error?: string | null;
  warnings?: string[];
  expiresAt: string;
  downloadAvailable?: boolean;
};

export class JobApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    status: number,
    options?: { retryAfterSeconds?: number },
  ) {
    super(
      messageForErrorCode(code, {
        retryAfterSeconds: options?.retryAfterSeconds,
      }),
    );
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

async function readError(res: Response): Promise<JobApiError> {
  let code = "conversion_failed";
  let retryAfterSeconds: number | undefined;
  try {
    const body = (await res.json()) as {
      error?: string;
      retryAfterSeconds?: number;
    };
    if (body?.error) code = body.error;
    if (
      typeof body?.retryAfterSeconds === "number" &&
      Number.isFinite(body.retryAfterSeconds)
    ) {
      retryAfterSeconds = body.retryAfterSeconds;
    }
  } catch {
    /* keep default */
  }
  if (retryAfterSeconds == null) {
    const header = res.headers.get("Retry-After");
    if (header) {
      const parsed = Number.parseInt(header, 10);
      if (Number.isFinite(parsed) && parsed > 0) retryAfterSeconds = parsed;
    }
  }
  return new JobApiError(code, res.status, { retryAfterSeconds });
}

export async function createJob(
  idempotencyKey: string,
): Promise<CreateJobResponse> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: "{}",
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as CreateJobResponse;
}

export async function putUpload(
  upload: UploadAuthorization,
  file: File,
): Promise<void> {
  const res = await fetch(upload.url, {
    method: upload.method,
    credentials: "omit",
    headers: {
      ...upload.headers,
      "content-type":
        upload.headers["Content-Type"] ??
        upload.headers["content-type"] ??
        "application/pdf",
    },
    body: file,
  });
  if (!res.ok) throw await readError(res);
}

export async function completeUpload(
  jobId: string,
  secret: string,
): Promise<JobStatusResponse> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/complete-upload`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      authorization: `Bearer ${secret}`,
    },
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as JobStatusResponse;
}

export async function getJob(
  jobId: string,
  secret: string,
  signal?: AbortSignal,
): Promise<JobStatusResponse> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      authorization: `Bearer ${secret}`,
    },
    signal,
  });
  // Deletion cleanup still in progress — not an OK body, but a known code.
  if (res.status === 202) {
    throw await readError(res);
  }
  if (!res.ok) throw await readError(res);
  return (await res.json()) as JobStatusResponse;
}

/**
 * Stream resume-editable.docx through the authenticated download endpoint.
 * Does not delete the job. Caller must not treat a 200 as proof the user saved
 * or opened the file (US-020 / Claims and Non Goals).
 */
export async function downloadJob(
  jobId: string,
  secret: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const res = await fetch(
    `/api/jobs/${encodeURIComponent(jobId)}/download`,
    {
      method: "GET",
      credentials: "same-origin",
      headers: {
        authorization: `Bearer ${secret}`,
      },
      signal,
    },
  );
  if (!res.ok) throw await readError(res);
  return res.blob();
}

/** Default Content-Disposition filename from the download route. */
export const DOWNLOAD_FILENAME = "resume-editable.docx";

/**
 * Cancel / delete. API returns 202 + delete_pending while cleanup is pending.
 * Callers must not treat 202 as verified deletion (Deletion Contract / US-032).
 */
export async function deleteJob(
  jobId: string,
  secret: string,
  signal?: AbortSignal,
): Promise<"delete_pending"> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      authorization: `Bearer ${secret}`,
    },
    signal,
  });
  if (res.status === 202) {
    let code = "delete_pending";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      /* keep default */
    }
    if (code === "delete_pending") return "delete_pending";
    throw new JobApiError(code, 202);
  }
  if (!res.ok) throw await readError(res);
  // Unexpected 2xx without delete_pending — still do not claim deleted.
  return "delete_pending";
}
