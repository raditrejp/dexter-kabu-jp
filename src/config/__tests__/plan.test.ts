import { describe, test, expect } from 'vitest';
import {
  PLAN_CAPABILITIES,
  getPlanCapabilities,
  isEndpointAvailable,
  type JQuantsPlan,
} from '../plan.js';

// ── PLAN_CAPABILITIES ───────────────────────────────────────────────

describe('PLAN_CAPABILITIES', () => {
  test('free plan has 12 weeks range and 5 req/min', () => {
    const caps = PLAN_CAPABILITIES.free;
    expect(caps.dataRangeWeeks).toBe(12);
    expect(caps.rateLimitPerMinute).toBe(5);
  });

  test('light plan has 260 weeks range and 60 req/min', () => {
    const caps = PLAN_CAPABILITIES.light;
    expect(caps.dataRangeWeeks).toBe(260);
    expect(caps.rateLimitPerMinute).toBe(60);
  });

  test('standard plan has 520 weeks range and 120 req/min', () => {
    const caps = PLAN_CAPABILITIES.standard;
    expect(caps.dataRangeWeeks).toBe(520);
    expect(caps.rateLimitPerMinute).toBe(120);
  });

  test('premium plan has 1040 weeks range and 500 req/min', () => {
    const caps = PLAN_CAPABILITIES.premium;
    expect(caps.dataRangeWeeks).toBe(1040);
    expect(caps.rateLimitPerMinute).toBe(500);
  });

  test('all four plans are defined', () => {
    const plans: JQuantsPlan[] = ['free', 'light', 'standard', 'premium'];
    for (const p of plans) {
      expect(PLAN_CAPABILITIES[p]).toBeDefined();
    }
  });
});

// ── getPlanCapabilities ─────────────────────────────────────────────

describe('getPlanCapabilities', () => {
  test('returns same object as direct lookup', () => {
    expect(getPlanCapabilities('free')).toBe(PLAN_CAPABILITIES.free);
    expect(getPlanCapabilities('premium')).toBe(PLAN_CAPABILITIES.premium);
  });
});

// ── isEndpointAvailable ─────────────────────────────────────────────

describe('isEndpointAvailable', () => {
  test('free plan has listed/info', () => {
    expect(isEndpointAvailable('free', 'listed/info')).toBe(true);
  });

  test('free plan has prices/daily_quotes', () => {
    expect(isEndpointAvailable('free', 'prices/daily_quotes')).toBe(true);
  });

  test('free plan does NOT have markets/trades_spec', () => {
    expect(isEndpointAvailable('free', 'markets/trades_spec')).toBe(false);
  });

  test('light plan has markets/trades_spec', () => {
    expect(isEndpointAvailable('light', 'markets/trades_spec')).toBe(true);
  });

  test('light plan inherits free endpoints', () => {
    expect(isEndpointAvailable('light', 'listed/info')).toBe(true);
    expect(isEndpointAvailable('light', 'fins/statements')).toBe(true);
  });

  test('standard plan has indices', () => {
    expect(isEndpointAvailable('standard', 'indices')).toBe(true);
  });

  test('standard plan does NOT have fins/dividend', () => {
    expect(isEndpointAvailable('standard', 'fins/dividend')).toBe(false);
  });

  test('premium plan has fins/dividend and fins/fs_details', () => {
    expect(isEndpointAvailable('premium', 'fins/dividend')).toBe(true);
    expect(isEndpointAvailable('premium', 'fins/fs_details')).toBe(true);
  });

  test('premium plan inherits all lower-tier endpoints', () => {
    expect(isEndpointAvailable('premium', 'listed/info')).toBe(true);
    expect(isEndpointAvailable('premium', 'markets/trades_spec')).toBe(true);
    expect(isEndpointAvailable('premium', 'indices')).toBe(true);
  });

  test('prefix matching works (endpoint with query params)', () => {
    expect(isEndpointAvailable('free', 'listed/info?code=7203')).toBe(true);
  });

  test('returns false for completely unknown endpoint', () => {
    expect(isEndpointAvailable('premium', 'nonexistent/endpoint')).toBe(false);
  });
});
