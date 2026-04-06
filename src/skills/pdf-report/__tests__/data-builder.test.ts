import { describe, test, expect } from 'vitest';
import { buildAnalysisInput } from '../data-builder.js';
import { readFileSync } from 'fs';

const toyotaData = JSON.parse(readFileSync('/tmp/toyota_data.json', 'utf-8'));

describe('buildAnalysisInput', () => {
  test('builds valid input from Toyota data', () => {
    const input = buildAnalysisInput(toyotaData, 3255, '輸送用機器');

    // 全フィールドが存在
    expect(input.fundamentals).toBeDefined();
    expect(input.technical).toBeDefined();
    expect(input.supplyDemand).toBeDefined();
    expect(input.shareholderReturn).toBeDefined();

    // DCF乖離率が計算されている（nullでない）
    expect(input.fundamentals.dcfGapPercent).not.toBe(0);
    expect(typeof input.fundamentals.dcfGapPercent).toBe('number');

    // PERが正の値
    expect(input.fundamentals.per).toBeGreaterThan(0);

    // ROEが正の値
    expect(input.fundamentals.roe).toBeGreaterThan(0);

    // 配当成長率が計算されている
    expect(typeof input.shareholderReturn.dividendGrowthRate3to5y).toBe('number');

    // 事業独占力の時系列データ
    expect(input.fundamentals.operatingMarginHistory.length).toBeGreaterThanOrEqual(5);
    expect(input.fundamentals.roeHistory.length).toBeGreaterThanOrEqual(5);

    // isFinancialがfalse（輸送用機器）
    expect(input.fundamentals.isFinancial).toBe(false);
  });

  test('financial sector is detected', () => {
    const input = buildAnalysisInput(toyotaData, 3255, '銀行業');
    expect(input.fundamentals.isFinancial).toBe(true);
  });

  test('technical defaults to neutral values', () => {
    const input = buildAnalysisInput(toyotaData, 3255, '輸送用機器');
    // technicalはデフォルト値（analyzeTechnicalで上書きする前提）
    expect(input.technical.sepaStage).toBe('S1');
    expect(input.technical.dowTrend).toBe('range');
    expect(input.technical.granvilleSignal).toBeNull();
  });
});
