import { describe, test, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../rate-limiter.js';

/**
 * Testable subclass that records sleep calls instead of actually sleeping,
 * and allows manual time advancement.
 */
class TestRateLimiter extends RateLimiter {
  public sleepCalls: number[] = [];
  private _now: number;

  constructor(maxRequestsPerMinute: number, startTime = 0) {
    super(maxRequestsPerMinute);
    this._now = startTime;
    // Override Date.now for this instance via prototype patching won't work,
    // so we override the cleanup and acquire indirectly by overriding sleep.
  }

  protected override sleep(ms: number): Promise<void> {
    this.sleepCalls.push(ms);
    // Advance time by the sleep duration so subsequent cleanup works.
    this._now += ms;
    return Promise.resolve();
  }

  /** Advance the internal clock (used to simulate time passing). */
  advanceTime(ms: number): void {
    this._now += ms;
  }
}

// ── Basic behavior ──────────────────────────────────────────────────

describe('RateLimiter', () => {
  test('acquire resolves immediately when under limit', async () => {
    const limiter = new RateLimiter(5);
    // Should not throw or hang
    await limiter.acquire();
    await limiter.acquire();
    expect(limiter.pending).toBeLessThanOrEqual(5);
  });

  test('pending count increases with each acquire', async () => {
    const limiter = new RateLimiter(10);
    expect(limiter.pending).toBe(0);
    await limiter.acquire();
    expect(limiter.pending).toBe(1);
    await limiter.acquire();
    expect(limiter.pending).toBe(2);
  });

  test('acquire does not exceed limit (calls sleep when full)', async () => {
    const limiter = new TestRateLimiter(2);

    await limiter.acquire(); // slot 1
    await limiter.acquire(); // slot 2

    // Third acquire should trigger a sleep since limit is 2
    await limiter.acquire();

    expect(limiter.sleepCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('sleep duration is positive when limit is reached', async () => {
    const limiter = new TestRateLimiter(1);

    await limiter.acquire(); // slot 1

    // Second acquire must wait
    await limiter.acquire();

    expect(limiter.sleepCalls.length).toBe(1);
    expect(limiter.sleepCalls[0]).toBeGreaterThan(0);
  });

  test('constructor accepts various plan limits', () => {
    const l5 = new RateLimiter(5);
    const l60 = new RateLimiter(60);
    const l500 = new RateLimiter(500);

    // Should construct without error
    expect(l5).toBeInstanceOf(RateLimiter);
    expect(l60).toBeInstanceOf(RateLimiter);
    expect(l500).toBeInstanceOf(RateLimiter);
  });

  test('pending returns 0 for a fresh limiter', () => {
    const limiter = new RateLimiter(10);
    expect(limiter.pending).toBe(0);
  });
});
