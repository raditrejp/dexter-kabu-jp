import { describe, test, expect } from 'bun:test';
import { extractKeyRatios, parseSectorMarket, KEY_RATIO_METRICS } from '../radikabunavi-helpers.js';

// get_edinet_financial_data（metrics 指定時）の応答の形。値は動作確認用の架空値。
const financialData = JSON.stringify({
  companyName: 'テスト株式会社',
  fiscalYears: {
    '2024-03-31': { per: 10.1, pbr: 1.0, roe: 8.0, eps: 100 },
    '2025-03-31': { per: 12.5, pbr: 1.2, roe: 9.5, dividendYield: 2.4, eps: 120, roa: null },
  },
  metricLabels: { per: 'PER' },
  watchlistSuggestion: { message: '監視リストに追加しますか？' },
});

describe('extractKeyRatios', () => {
  test('uses the latest fiscal year and drops null/missing metrics', () => {
    const out = extractKeyRatios(financialData, '9999') as any;
    expect(out.code).toBe('9999');
    expect(out.companyName).toBe('テスト株式会社');
    expect(out.fiscalYearEnd).toBe('2025-03-31');
    expect(out.ratios).toEqual({ per: 12.5, pbr: 1.2, roe: 9.5, dividendYield: 2.4, eps: 120 });
    expect(out.note).toContain('現在値ではありません');
    // LLM に渡さない項目
    expect(JSON.stringify(out)).not.toContain('watchlistSuggestion');
    expect(JSON.stringify(out)).not.toContain('metricLabels');
  });

  test('throws when fiscalYears is missing or empty', () => {
    expect(() => extractKeyRatios('{"companyName":"x"}', '9999')).toThrow('fiscalYears');
    expect(() => extractKeyRatios('{"fiscalYears":{}}', '9999')).toThrow('fiscalYears');
  });

  test('throws a readable error when the text is not JSON', () => {
    expect(() => extractKeyRatios('本日の上限です', '9999')).toThrow('JSON として読めません');
  });

  test('requests metrics that exist in the server metric list', () => {
    // サーバーの edinet-financial-data.ts の metrics 説明に載っている英語キー
    for (const m of ['per', 'pbr', 'roe', 'dividendYield', 'equityRatio', 'marketCap']) {
      expect(KEY_RATIO_METRICS as readonly string[]).toContain(m);
    }
  });
});

// search_stocks の応答（jsonResult。{ query, matchedCount, results }）の形
const searchResponse = (results: unknown[]) =>
  JSON.stringify({ query: 'q', matchedCount: results.length, results }, null, 2);

describe('parseSectorMarket', () => {
  const rows = [
    { matchedBy: 'code', code: '8306', companyName: 'テスト銀行', sector: '銀行業', market: 'プライム', fiscalYearEnd: '03-31' },
    { matchedBy: 'code', code: '83060', companyName: '別会社', sector: '電気機器', market: 'スタンダード', fiscalYearEnd: '03-31' },
  ];

  test('returns sector and market of the row whose code matches (financial sector detectable)', () => {
    expect(parseSectorMarket(searchResponse(rows), '8306')).toEqual({ sector: '銀行業', market: 'プライム' });
  });

  test('accepts 5-digit code and alphanumeric code', () => {
    expect(parseSectorMarket(searchResponse(rows), '83060')).toEqual({ sector: '銀行業', market: 'プライム' });
    const alnum = [{ code: '140A', companyName: 'x', sector: '情報・通信業', market: 'グロース' }];
    expect(parseSectorMarket(searchResponse(alnum), '140a')).toEqual({ sector: '情報・通信業', market: 'グロース' });
  });

  test('returns null when no row matches the code (prefix hits only)', () => {
    const prefixOnly = [{ code: '83061', companyName: 'y', sector: 'z', market: 'm' }];
    expect(parseSectorMarket(searchResponse(prefixOnly), '8306')).toBeNull();
  });

  test('returns null for non-JSON text or missing results', () => {
    expect(parseSectorMarket('エラー', '8306')).toBeNull();
    expect(parseSectorMarket('{"matchedCount":0}', '8306')).toBeNull();
  });
});
