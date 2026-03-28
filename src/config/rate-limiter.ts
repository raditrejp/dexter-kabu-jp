/**
 * Sliding-window rate limiter for JQuants API requests.
 *
 * Tracks timestamps of requests within a 60-second window.
 * `acquire()` resolves immediately when under the limit, or waits
 * until a slot becomes available.
 */

const WINDOW_MS = 60_000; // 60-second sliding window

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly timestamps: number[] = [];

  constructor(maxRequestsPerMinute: number) {
    this.maxRequests = maxRequestsPerMinute;
  }

  /**
   * Acquire a rate-limit slot.
   *
   * Returns immediately if under the limit. Otherwise waits until the
   * oldest request in the window expires and a slot opens up.
   */
  async acquire(): Promise<void> {
    this.cleanup();

    if (this.timestamps.length < this.maxRequests) {
      this.timestamps.push(Date.now());
      return;
    }

    // Wait until the oldest request falls outside the window
    const oldest = this.timestamps[0]!;
    const waitMs = oldest + WINDOW_MS - Date.now() + 1; // +1ms to ensure it's past

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }

    // Clean up and record this request
    this.cleanup();
    this.timestamps.push(Date.now());
  }

  /** Number of requests currently tracked in the window. */
  get pending(): number {
    this.cleanup();
    return this.timestamps.length;
  }

  /** Remove timestamps older than the 60-second window. */
  private cleanup(): void {
    const cutoff = Date.now() - WINDOW_MS;
    while (this.timestamps.length > 0 && this.timestamps[0]! <= cutoff) {
      this.timestamps.shift();
    }
  }

  /** Overridable for testing. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
