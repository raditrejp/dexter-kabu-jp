import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { JQuantsClient } from '../jquants-client.js';
import type { JQuantsPlan } from '../../../config/plan.js';

// ── Test helpers ────────────────────────────────────────────────────

const originalEnv = { ...process.env };

function setEnv(mail: string, password: string, plan: JQuantsPlan = 'free') {
  process.env.JQUANTS_MAIL = mail;
  process.env.JQUANTS_PASSWORD = password;
  process.env.JQUANTS_PLAN = plan;
}

function clearEnv() {
  delete process.env.JQUANTS_MAIL;
  delete process.env.JQUANTS_PASSWORD;
  delete process.env.JQUANTS_PLAN;
}

// ── Constructor ─────────────────────────────────────────────────────

describe('JQuantsClient constructor', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('constructs with valid env vars', () => {
    setEnv('test@example.com', 'password123');
    const client = new JQuantsClient('free');
    expect(client).toBeInstanceOf(JQuantsClient);
  });

  test('throws when JQUANTS_MAIL is missing', () => {
    process.env.JQUANTS_PASSWORD = 'password123';
    delete process.env.JQUANTS_MAIL;
    expect(() => new JQuantsClient('free')).toThrow('JQUANTS_MAIL');
  });

  test('throws when JQUANTS_PASSWORD is missing', () => {
    process.env.JQUANTS_MAIL = 'test@example.com';
    delete process.env.JQUANTS_PASSWORD;
    expect(() => new JQuantsClient('free')).toThrow('JQUANTS_PASSWORD');
  });
});

// ── buildUrl ────────────────────────────────────────────────────────

describe('JQuantsClient.buildUrl', () => {
  beforeEach(() => {
    setEnv('test@example.com', 'password123');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('builds URL with no params', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('listed/info');
    expect(url).toBe('https://api.jquants.com/v2/listed/info');
  });

  test('builds URL with query params', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('prices/daily_quotes', {
      code: '7203',
      from: '2024-01-01',
    });
    expect(url).toBe(
      'https://api.jquants.com/v2/prices/daily_quotes?code=7203&from=2024-01-01',
    );
  });

  test('omits undefined param values', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('prices/daily_quotes', {
      code: '7203',
      from: undefined,
    });
    expect(url).toBe(
      'https://api.jquants.com/v2/prices/daily_quotes?code=7203',
    );
  });

  test('handles empty params object', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('listed/info', {});
    expect(url).toBe('https://api.jquants.com/v2/listed/info');
  });
});

// ── isAvailable ─────────────────────────────────────────────────────

describe('JQuantsClient.isAvailable', () => {
  beforeEach(() => {
    setEnv('test@example.com', 'password123');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('free plan has listed/info', () => {
    const client = new JQuantsClient('free');
    expect(client.isAvailable('listed/info')).toBe(true);
  });

  test('free plan does NOT have markets/trades_spec', () => {
    const client = new JQuantsClient('free');
    expect(client.isAvailable('markets/trades_spec')).toBe(false);
  });

  test('premium plan has fins/dividend', () => {
    const client = new JQuantsClient('premium');
    expect(client.isAvailable('fins/dividend')).toBe(true);
  });
});

// ── dataRangeWeeks ──────────────────────────────────────────────────

describe('JQuantsClient.dataRangeWeeks', () => {
  beforeEach(() => {
    setEnv('test@example.com', 'password123');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('returns 12 for free plan', () => {
    const client = new JQuantsClient('free');
    expect(client.dataRangeWeeks).toBe(12);
  });

  test('returns 260 for light plan', () => {
    const client = new JQuantsClient('light');
    expect(client.dataRangeWeeks).toBe(260);
  });

  test('returns 520 for standard plan', () => {
    const client = new JQuantsClient('standard');
    expect(client.dataRangeWeeks).toBe(520);
  });

  test('returns 1040 for premium plan', () => {
    const client = new JQuantsClient('premium');
    expect(client.dataRangeWeeks).toBe(1040);
  });
});

// ── Token management (unit-level, no real API calls) ────────────────

describe('JQuantsClient token state', () => {
  beforeEach(() => {
    setEnv('test@example.com', 'password123');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('initially has no token', () => {
    const client = new JQuantsClient('free');
    // Access internal state through ensureToken — it should attempt auth
    // We can't call ensureToken without mocking fetch, so just verify
    // construction doesn't set a token.
    expect((client as any).idToken).toBeUndefined();
    expect((client as any).tokenExpiresAt).toBe(0);
  });
});
