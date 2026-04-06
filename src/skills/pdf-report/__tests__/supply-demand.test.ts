import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchSupplyDemandData } from '../supply-demand.js';
import type { MarginInterestRecord } from '../supply-demand.js';

const originalEnv = { ...process.env };

function mockFetch(records: MarginInterestRecord[], key = 'weekly_margin_interest') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ [key]: records }),
  });
}

function makeRecord(overrides: Partial<MarginInterestRecord> = {}): MarginInterestRecord {
  return {
    Date: '2026-03-28',
    Code: '72030',
    LongVol: 100000,
    ShrtVol: 30000,
    LongNegVol: 10000,
    ShrtNegVol: 5000,
    LongStdVol: 90000,
    ShrtStdVol: 25000,
    IssType: '1',
    ...overrides,
  };
}

describe('fetchSupplyDemandData', () => {
  beforeEach(() => {
    process.env.JQUANTS_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test('returns null for free plan', async () => {
    const result = await fetchSupplyDemandData('7203', 'free');
    expect(result).toBeNull();
  });

  test('returns null for light plan', async () => {
    const result = await fetchSupplyDemandData('7203', 'light');
    expect(result).toBeNull();
  });

  test('fetches margin data for standard plan', async () => {
    const records = [
      makeRecord({ Date: '2026-03-21', LongVol: 80000, ShrtVol: 25000 }),
      makeRecord({ Date: '2026-03-28', LongVol: 100000, ShrtVol: 30000 }),
    ];
    vi.stubGlobal('fetch', mockFetch(records));

    const result = await fetchSupplyDemandData('7203', 'standard');
    expect(result).not.toBeNull();
    expect(result!.marginBalanceRatio).toBeCloseTo(3.33, 1);
    expect(result!.latestLongVol).toBe(100000);
    expect(result!.latestShortVol).toBe(30000);
    expect(result!.records).toHaveLength(2);
  });

  test('normalizes 4-digit code to 5-digit', async () => {
    vi.stubGlobal('fetch', mockFetch([makeRecord()]));

    await fetchSupplyDemandData('7203', 'standard');

    const fetchCall = (fetch as any).mock.calls[0];
    const url = fetchCall[0] as string;
    expect(url).toContain('code=72030');
  });

  test('includes IssType 1 and 2, excludes 3', async () => {
    const records = [
      makeRecord({ IssType: '1', LongVol: 100000, ShrtVol: 30000 }),
      makeRecord({ IssType: '2', LongVol: 200000, ShrtVol: 50000, Date: '2026-03-29' }),
      makeRecord({ IssType: '3', LongVol: 50000, ShrtVol: 10000 }),
    ];
    vi.stubGlobal('fetch', mockFetch(records));

    const result = await fetchSupplyDemandData('7203', 'standard');
    expect(result).not.toBeNull();
    expect(result!.records).toHaveLength(2);
    // Latest by date is IssType 2
    expect(result!.marginBalanceRatio).toBe(4);
  });

  test('works with "data" response key (V2 format)', async () => {
    const records = [
      makeRecord({ IssType: '2', LongVol: 100000, ShrtVol: 25000 }),
    ];
    vi.stubGlobal('fetch', mockFetch(records, 'data'));

    const result = await fetchSupplyDemandData('7203', 'standard');
    expect(result).not.toBeNull();
    expect(result!.marginBalanceRatio).toBe(4);
  });

  test('returns null when no records match', async () => {
    vi.stubGlobal('fetch', mockFetch([]));

    const result = await fetchSupplyDemandData('7203', 'standard');
    expect(result).toBeNull();
  });

  test('handles zero short volume (returns 999)', async () => {
    const records = [makeRecord({ ShrtVol: 0 })];
    vi.stubGlobal('fetch', mockFetch(records));

    const result = await fetchSupplyDemandData('7203', 'standard');
    expect(result).not.toBeNull();
    expect(result!.marginBalanceRatio).toBe(999);
  });

  test('uses latest record (sorted by date)', async () => {
    const records = [
      makeRecord({ Date: '2026-03-28', LongVol: 120000, ShrtVol: 40000 }),
      makeRecord({ Date: '2026-03-14', LongVol: 80000, ShrtVol: 20000 }),
      makeRecord({ Date: '2026-03-21', LongVol: 100000, ShrtVol: 30000 }),
    ];
    vi.stubGlobal('fetch', mockFetch(records));

    const result = await fetchSupplyDemandData('7203', 'standard');
    expect(result).not.toBeNull();
    // Latest = 2026-03-28: 120000 / 40000 = 3.0
    expect(result!.marginBalanceRatio).toBe(3);
    expect(result!.latestLongVol).toBe(120000);
  });

  test('works with premium plan', async () => {
    vi.stubGlobal('fetch', mockFetch([makeRecord()]));

    const result = await fetchSupplyDemandData('7203', 'premium');
    expect(result).not.toBeNull();
  });
});
