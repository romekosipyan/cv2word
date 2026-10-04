/** Simple timestamp sliding window for in-process rate alerts (local + test). */

export class SlidingWindow {
  private readonly stamps: number[] = [];

  record(atMs: number = Date.now()): void {
    this.stamps.push(atMs);
  }

  /** Drop samples older than the window and return the remaining count. */
  count(nowMs: number, windowSeconds: number): number {
    const cutoff = nowMs - Math.max(1, windowSeconds) * 1000;
    while (this.stamps.length > 0 && this.stamps[0]! < cutoff) {
      this.stamps.shift();
    }
    return this.stamps.length;
  }

  clear(): void {
    this.stamps.length = 0;
  }
}
