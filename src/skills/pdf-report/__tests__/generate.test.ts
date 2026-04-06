import { describe, test, expect } from 'vitest';
import { generateReport } from '../generate.js';
import type { ReportInput } from '../generate.js';
import { existsSync, unlinkSync } from 'fs';

const sampleInput: ReportInput = {
  code: '7203',
  name: 'トヨタ自動車',
  sector: '輸送用機器',
  market: '東証プライム',
  price: 2530,
  marketCap: 412000,
  analysisDate: '2099-12-31',
  scores: {
    valuation: 72, profitability: 85, growth: 45,
    safety: 78, trend: 68, supplyDemand: 62,
    shareholderReturn: 75, moat: 70,
  },
  industryAvg: {
    valuation: 50, profitability: 60, growth: 55,
    safety: 65, trend: 50, supplyDemand: 50,
    shareholderReturn: 55, moat: 55,
  },
  details: {
    valuation: 'DCF理論株価: 2,850円（現在比+12.6%）。PER 15倍（業界平均20倍）。',
    profitability: 'ROE 18.2%（業界平均12.5%）。営業利益率9.8%。',
    growth: '売上成長率3.2%（業界平均5.8%）。',
    safety: 'Altman Z\'\' 3.2（安全圏）。自己資本比率52%。',
    trend: 'SEPA S2。ダウ理論: 上昇。グランビル: B2。',
    supplyDemand: '信用倍率3.1倍。出来高+15%。',
    shareholderReturn: '配当利回り2.8%。増配率+8%/年。',
    moat: '営業利益率σ: 1.8%（安定）。ROEσ: 2.3%。FCFマージンσ: 3.1%。',
  },
  summary: 'トヨタ自動車は稼ぐ力と安全性で業界を大きく上回る。',
  risks: [
    { title: 'EV転換コスト', description: 'BEV競争の激化。' },
    { title: '円高リスク', description: '1円で約400億円の影響。' },
  ],
  priceData: Array.from({ length: 60 }, (_, i) => {
    const d = new Date(2026, 0, 6 + i);
    return {
      date: d.toISOString().slice(0, 10),
      close: 2400 + i * 3.3,
      volume: 10000000 + i * 100000,
      sma50: 2450 + i * 0.5,
    };
  }),
};

describe('generateReport', () => {
  test('generates a PDF file', async () => {
    const outputPath = await generateReport(sampleInput);
    expect(outputPath).toContain('2099-12-31_7203_report.pdf');
    expect(existsSync(outputPath)).toBe(true);
    unlinkSync(outputPath);
  }, 30000);

  test('generates PDF without JQuants data', async () => {
    const noJQuantsInput: ReportInput = {
      ...sampleInput,
      hasJQuants: false,
      priceData: [],
      scores: { ...sampleInput.scores, trend: 0, supplyDemand: 0 },
    };
    const outputPath = await generateReport(noJQuantsInput);
    expect(outputPath).toContain('_7203_report.pdf');
    expect(existsSync(outputPath)).toBe(true);
    unlinkSync(outputPath);
  }, 30000);
});
