import { describe, test, expect } from 'vitest';
import { CompanyResolver, type CompanyInfo } from '../resolver.js';
import type { EdinetClient } from '../edinet-client.js';

// ── Mock EDINET client ─────────────────────────────────────────────

function createMockClient(): EdinetClient {
  return {} as EdinetClient;
}

// ── Static helpers ─────────────────────────────────────────────────

describe('CompanyResolver.normalize4To5Digit', () => {
  test('appends 0 to 4-digit code', () => {
    expect(CompanyResolver.normalize4To5Digit('7203')).toBe('72030');
  });

  test('appends 0 to another code', () => {
    expect(CompanyResolver.normalize4To5Digit('9984')).toBe('99840');
  });
});

describe('CompanyResolver.isSecuritiesCode', () => {
  test('returns true for 4-digit code', () => {
    expect(CompanyResolver.isSecuritiesCode('7203')).toBe(true);
  });

  test('returns false for 5-digit code', () => {
    expect(CompanyResolver.isSecuritiesCode('72030')).toBe(false);
  });

  test('returns false for EDINET code', () => {
    expect(CompanyResolver.isSecuritiesCode('E02144')).toBe(false);
  });

  test('returns false for company name', () => {
    expect(CompanyResolver.isSecuritiesCode('トヨタ自動車')).toBe(false);
  });

  test('returns false for 3-digit string', () => {
    expect(CompanyResolver.isSecuritiesCode('720')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(CompanyResolver.isSecuritiesCode('')).toBe(false);
  });
});

describe('CompanyResolver.isEdinetCode', () => {
  test('returns true for valid EDINET code', () => {
    expect(CompanyResolver.isEdinetCode('E02144')).toBe(true);
  });

  test('returns false for securities code', () => {
    expect(CompanyResolver.isEdinetCode('7203')).toBe(false);
  });

  test('returns false for lowercase e', () => {
    expect(CompanyResolver.isEdinetCode('e02144')).toBe(false);
  });

  test('returns false for wrong digit count', () => {
    expect(CompanyResolver.isEdinetCode('E0214')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(CompanyResolver.isEdinetCode('')).toBe(false);
  });
});

// ── Cache ──────────────────────────────────────────────────────────

describe('CompanyResolver cache', () => {
  const sampleInfo: CompanyInfo = {
    code: '7203',
    code5: '72030',
    name: 'トヨタ自動車',
    edinetCode: 'E02144',
    sector33: '輸送用機器',
  };

  test('cacheGet returns undefined for unknown key', () => {
    const resolver = new CompanyResolver(createMockClient());
    expect(resolver.cacheGet('7203')).toBeUndefined();
  });

  test('cacheSet and cacheGet by original key', () => {
    const resolver = new CompanyResolver(createMockClient());
    resolver.cacheSet('7203', sampleInfo);
    expect(resolver.cacheGet('7203')).toEqual(sampleInfo);
  });

  test('cross-indexes by 4-digit code', () => {
    const resolver = new CompanyResolver(createMockClient());
    resolver.cacheSet('some-key', sampleInfo);
    expect(resolver.cacheGet('7203')).toEqual(sampleInfo);
  });

  test('cross-indexes by 5-digit code', () => {
    const resolver = new CompanyResolver(createMockClient());
    resolver.cacheSet('some-key', sampleInfo);
    expect(resolver.cacheGet('72030')).toEqual(sampleInfo);
  });

  test('cross-indexes by company name', () => {
    const resolver = new CompanyResolver(createMockClient());
    resolver.cacheSet('some-key', sampleInfo);
    expect(resolver.cacheGet('トヨタ自動車')).toEqual(sampleInfo);
  });

  test('cross-indexes by EDINET code', () => {
    const resolver = new CompanyResolver(createMockClient());
    resolver.cacheSet('some-key', sampleInfo);
    expect(resolver.cacheGet('E02144')).toEqual(sampleInfo);
  });

  test('overwrites existing cache entry', () => {
    const resolver = new CompanyResolver(createMockClient());
    resolver.cacheSet('7203', sampleInfo);

    const updated: CompanyInfo = {
      ...sampleInfo,
      sector33: '自動車',
    };
    resolver.cacheSet('7203', updated);
    expect(resolver.cacheGet('7203')?.sector33).toBe('自動車');
  });
});
