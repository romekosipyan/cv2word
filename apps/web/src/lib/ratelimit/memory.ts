/**
 * In-process sliding-window rate limiter (US-040).
 * Suitable for local-dev / single-instance; multi-instance needs a shared store later.
 */

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export class MemoryRateLimiter {
  private readonly windows = new Map<string, number[]>();

  consume(
    key: string,
    limit: number,
    windowMs: number,
    now = Date.now(),
  ): RateLimitResult {
    if (limit <= 0 || windowMs <= 0) {
      return { ok: true };
    }
    const cutoff = now - windowMs;
    let stamps = this.windows.get(key) ?? [];
    stamps = stamps.filter((t) => t > cutoff);
    if (stamps.length >= limit) {
      const oldest = stamps[0]!;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000),
      );
      this.windows.set(key, stamps);
      return { ok: false, retryAfterSeconds };
    }
    stamps.push(now);
    this.windows.set(key, stamps);
    return { ok: true };
  }

  reset(): void {
    this.windows.clear();
  }
}

const singleton = new MemoryRateLimiter();

export function getMemoryRateLimiter(): MemoryRateLimiter {
  return singleton;
}

export function resetRateLimiterForTests(): void {
  singleton.reset();
}
