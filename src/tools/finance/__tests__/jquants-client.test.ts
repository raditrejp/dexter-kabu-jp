import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { JQuantsClient } from '../jquants-client.js';
import type { JQuantsPlan } from '../../../config/plan.js';

// ── Test helpers ────────────────────────────────────────────────────

const originalEnv = { ...process.env };

function setEnv(apiKey: string, plan: JQuantsPlan = 'free') {
  process.env.JQUANTS_API_KEY = apiKey;
  process.env.JQUANTS_PLAN = plan;
}

function clearEnv() {
  delete process.env.JQUANTS_API_KEY;
  delete process.env.JQUANTS_PLAN;
}

// ── Constructor ─────────────────────────────────────────────────────

describe('JQuantsClient constructor', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('constructs with valid JQUANTS_API_KEY', () => {
    setEnv('test-api-key-123');
    const client = new JQuantsClient('free');
    expect(client).toBeInstanceOf(JQuantsClient);
  });

  test('throws when JQUANTS_API_KEY is missing', () => {
    clearEnv();
    expect(() => new JQuantsClient('free')).toThrow('JQUANTS_API_KEY');
  });
});

// ── buildUrl ────────────────────────────────────────────────────────

describe('JQuantsClient.buildUrl', () => {
  beforeEach(() => {
    setEnv('test-api-key-123');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('builds URL with no params', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('equities/master');
    expect(url).toBe('https://api.jquants.com/v2/equities/master');
  });

  test('builds URL with query params', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('equities/bars/daily', {
      code: '72030',
      from: '2024-01-01',
    });
    expect(url).toBe(
      'https://api.jquants.com/v2/equities/bars/daily?code=72030&from=2024-01-01',
    );
  });

  test('omits undefined param values', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('equities/bars/daily', {
      code: '72030',
      from: undefined,
    });
    expect(url).toBe(
      'https://api.jquants.com/v2/equities/bars/daily?code=72030',
    );
  });

  test('handles empty params object', () => {
    const client = new JQuantsClient('free');
    const url = client.buildUrl('equities/master', {});
    expect(url).toBe('https://api.jquants.com/v2/equities/master');
  });
});

// ── isAvailable ─────────────────────────────────────────────────────

describe('JQuantsClient.isAvailable', () => {
  beforeEach(() => {
    setEnv('test-api-key-123');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('free plan has equities/master', () => {
    const client = new JQuantsClient('free');
    expect(client.isAvailable('equities/master')).toBe(true);
  });

  test('free plan does NOT have equities/investor-types', () => {
    const client = new JQuantsClient('free');
    expect(client.isAvailable('equities/investor-types')).toBe(false);
  });

  test('premium plan has fins/dividend', () => {
    const client = new JQuantsClient('premium');
    expect(client.isAvailable('fins/dividend')).toBe(true);
  });
});

// ── dataRangeWeeks ──────────────────────────────────────────────────

describe('JQuantsClient.dataRangeWeeks', () => {
  beforeEach(() => {
    setEnv('test-api-key-123');
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

// ── API Key stored correctly ────────────────────────────────────────

describe('JQuantsClient API key', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('stores API key from environment', () => {
    setEnv('my-secret-key');
    const client = new JQuantsClient('free');
    expect((client as any).apiKey).toBe('my-secret-key');
  });
});
