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

// ── isEndpointAvailable (V2 paths) ─────────────────────────────────

describe('isEndpointAvailable', () => {
  test('free plan has equities/master', () => {
    expect(isEndpointAvailable('free', 'equities/master')).toBe(true);
  });

  test('free plan has equities/bars/daily', () => {
    expect(isEndpointAvailable('free', 'equities/bars/daily')).toBe(true);
  });

  test('free plan does NOT have equities/investor-types', () => {
    expect(isEndpointAvailable('free', 'equities/investor-types')).toBe(false);
  });

  test('light plan has equities/investor-types', () => {
    expect(isEndpointAvailable('light', 'equities/investor-types')).toBe(true);
  });

  test('light plan inherits free endpoints', () => {
    expect(isEndpointAvailable('light', 'equities/master')).toBe(true);
    expect(isEndpointAvailable('light', 'fins/summary')).toBe(true);
  });

  test('standard plan has indices/bars/daily', () => {
    expect(isEndpointAvailable('standard', 'indices/bars/daily')).toBe(true);
  });

  test('standard plan has markets/margin-interest', () => {
    expect(isEndpointAvailable('standard', 'markets/margin-interest')).toBe(true);
  });

  test('standard plan does NOT have fins/dividend', () => {
    expect(isEndpointAvailable('standard', 'fins/dividend')).toBe(false);
  });

  test('premium plan has fins/dividend and fins/details', () => {
    expect(isEndpointAvailable('premium', 'fins/dividend')).toBe(true);
    expect(isEndpointAvailable('premium', 'fins/details')).toBe(true);
  });

  test('premium plan inherits all lower-tier endpoints', () => {
    expect(isEndpointAvailable('premium', 'equities/master')).toBe(true);
    expect(isEndpointAvailable('premium', 'equities/investor-types')).toBe(true);
    expect(isEndpointAvailable('premium', 'indices/bars/daily')).toBe(true);
  });

  test('prefix matching works (endpoint with query params)', () => {
    expect(isEndpointAvailable('free', 'equities/master?code=72030')).toBe(true);
  });

  test('returns false for completely unknown endpoint', () => {
    expect(isEndpointAvailable('premium', 'nonexistent/endpoint')).toBe(false);
  });
});
