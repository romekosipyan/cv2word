/**
 * Object key layout (job-scoped prefixes).
 * originals/{jobId}/…  outputs/{jobId}/…
 */

const KEY_PREFIX =
  /^(?:originals|outputs)\/([A-Za-z0-9_-]+)(?:\/|$)/;

/** Extract job id from a known object key, or null if the key is not job-scoped. */
export function jobIdFromObjectKey(objectKey: string): string | null {
  const m = KEY_PREFIX.exec(objectKey);
  return m?.[1] ?? null;
}

/** Inventoried object prefixes for a job (US-093 prefix orphan proof). */
export function jobObjectPrefixes(jobId: string): readonly [
  `originals/${string}`,
  `outputs/${string}`,
] {
  return [`originals/${jobId}`, `outputs/${jobId}`] as const;
}
