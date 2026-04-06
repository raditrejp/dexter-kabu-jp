import { describe, test, expect } from 'vitest';
import type { AnalysisInput, EightAxisScores } from '../scores.js';
import {
  clamp,
  lerp,
  calcValuation,
  calcProfitability,
  calcGrowth,
  calcSafety,
  equityToScore,
  calcTrend,
  calcSupplyDemand,
  calcShareholderReturn,
  calcMoat,
  stddev,
  calculateAllScores,
} from '../scores.js';

// 共通の追加フィールド（fundamentals拡張分）
const extraFundamentals = {
  ebitda: 500000,
  ebitdaMargin: 15,
  interestBearingDebt: 200000,
  cashAndDeposits: 100000,
  netDebtToEbitda: 0.2,
  debtToEquityRatio: 0.3,
  operatingCFToDebt: 35,
  operatingIncomePerEmployee: 5000,
  capexRatio: 6,
  sgaRatio: 20,
  fcfMargin: 8,
  revenueCagr5y: 4,
  operatingMarginHistory: [9, 9.5, 10, 9.8, 10.2, 9.7, 10.1, 9.6, 10.3, 9.8],
  roeHistory: [17, 18, 19, 17.5, 18.5, 18.2, 17.8, 19.2, 18.7, 18.0],
  fcfMarginHistory: [7, 7.5, 8, 7.8, 8.2, 7.7, 8.1, 7.6, 8.3, 7.9],
  sgaRatioHistory: [20, 20.1, 19.9, 20.2, 20.0, 19.8, 20.3, 19.7, 20.1, 20.0],
};


describe('type definitions', () => {
  test('AnalysisInput accepts valid data', () => {
    const input: AnalysisInput = {
      fundamentals: {
        dcfGapPercent: 12.6,
        per: 15,
        pbr: 1.2,
        ncavToMarketCap: 0.3,
        roe: 18.2,
        operatingMarginPercent: 9.8,
        roa: 7.5,
        revenueCagr3y: 3.2,
        epsCagr3y: 2.1,
        peg: 1.3,
        equityRatio: 52,
        altmanZ: 3.2,
        isFinancial: false,
        ...extraFundamentals,
      },
      technical: {
        sepaStage: 'S2',
        dowTrend: 'up',
        granvilleSignal: 'B2',
      },
      supplyDemand: {
        marginBalanceRatio: 3.1,
        volumeRatio5d20d: 1.15,
        monteCarloUpProb: 0.62,
      },
      shareholderReturn: {
        dividendYield: 2.8,
        dividendGrowthRate3to5y: 8,
        payoutRatio: 32,
        doe: 3.5,
        hasBuyback: true,
        buybackRecency: 'within1y',
        totalReturnRatio: 55,
        isNoDividend: false,
      },
    };
    expect(input).toBeDefined();
  });

  test('EightAxisScores has all 8 keys', () => {
    const scores: EightAxisScores = {
      valuation: 72,
      profitability: 85,
      growth: 45,
      safety: 78,
      trend: 68,
      supplyDemand: 62,
      shareholderReturn: 75,
      moat: 80,
    };
    expect(Object.keys(scores)).toHaveLength(8);
  });
});

describe('clamp', () => {
  test('clamps below min', () => expect(clamp(-5, 0, 100)).toBe(0));
  test('clamps above max', () => expect(clamp(120, 0, 100)).toBe(100));
  test('passes through in range', () => expect(clamp(50, 0, 100)).toBe(50));
});

describe('lerp (linear interpolation)', () => {
  test('maps input range to output range', () => {
    // DCF乖離率: -30→10, 0→50, +30→90
    expect(lerp(0, -30, 30, 10, 90)).toBeCloseTo(50);
    expect(lerp(30, -30, 30, 10, 90)).toBeCloseTo(90);
    expect(lerp(-30, -30, 30, 10, 90)).toBeCloseTo(10);
    expect(lerp(15, -30, 30, 10, 90)).toBeCloseTo(70);
  });

  test('clamps output outside input range', () => {
    expect(lerp(50, -30, 30, 10, 90)).toBe(90);
    expect(lerp(-50, -30, 30, 10, 90)).toBe(10);
  });
});

describe('calcValuation', () => {
  test('DCF +30% gap → high score', () => {
    const score = calcValuation(
      { dcfGapPercent: 30, per: 15, pbr: 0.8, ncavToMarketCap: 0.3, ebitda: 500000, interestBearingDebt: 200000, cashAndDeposits: 100000 },
    );
    expect(score).toBeGreaterThan(65);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('DCF -30% gap → low score', () => {
    const score = calcValuation(
      { dcfGapPercent: -30, per: 30, pbr: 3.0, ncavToMarketCap: 0.2, ebitda: 500000, interestBearingDebt: 200000, cashAndDeposits: 100000 },
    );
    expect(score).toBeLessThan(30);
  });

  test('net-net stock gets large bonus', () => {
    const withNetNet = calcValuation(
      { dcfGapPercent: 0, per: 20, pbr: 0.4, ncavToMarketCap: 1.6, ebitda: 500000, interestBearingDebt: 200000, cashAndDeposits: 100000 },
    );
    const withoutNetNet = calcValuation(
      { dcfGapPercent: 0, per: 20, pbr: 0.4, ncavToMarketCap: 0.3, ebitda: 500000, interestBearingDebt: 200000, cashAndDeposits: 100000 },
    );
    expect(withNetNet - withoutNetNet).toBeGreaterThanOrEqual(2);
  });

  test('result clamped to 0-100', () => {
    const score = calcValuation(
      { dcfGapPercent: 100, per: 5, pbr: 0.3, ncavToMarketCap: 2.0, ebitda: 500000, interestBearingDebt: 200000, cashAndDeposits: 100000 },
    );
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('calcProfitability', () => {
  test('high ROE + high margin → high score', () => {
    const score = calcProfitability(
      { roe: 20, operatingMarginPercent: 15, roa: 8, ebitdaMargin: 20, operatingIncomePerEmployee: 12000000 },
    );
    expect(score).toBeGreaterThan(75);
  });

  test('low ROE → low score', () => {
    const score = calcProfitability(
      { roe: 3, operatingMarginPercent: 2, roa: 1, ebitdaMargin: 3, operatingIncomePerEmployee: 1000000 },
    );
    expect(score).toBeLessThan(30);
  });
});

describe('calcGrowth', () => {
  test('high growth → high score', () => {
    const score = calcGrowth({ revenueCagr3y: 15, epsCagr3y: 20, peg: 0.8, capexRatio: 8, revenueCagr5y: 12 });
    expect(score).toBeGreaterThanOrEqual(80);
  });

  test('negative growth → low score', () => {
    const score = calcGrowth({ revenueCagr3y: -5, epsCagr3y: -3, peg: null, capexRatio: 1, revenueCagr5y: -2 });
    expect(score).toBeLessThan(30);
  });

  test('PEG null → no bonus/penalty', () => {
    const withPeg = calcGrowth({ revenueCagr3y: 8, epsCagr3y: 8, peg: 0.5, capexRatio: 5, revenueCagr5y: 7 });
    const noPeg = calcGrowth({ revenueCagr3y: 8, epsCagr3y: 8, peg: null, capexRatio: 5, revenueCagr5y: 7 });
    expect(withPeg).toBeGreaterThan(noPeg);
  });
});

describe('calcSafety', () => {
  test('safe zone Altman + high equity ratio', () => {
    const score = calcSafety({ altmanZ: 3.2, equityRatio: 55, isFinancial: false, netDebtToEbitda: 0.5, debtToEquityRatio: 0.3, operatingCFToDebt: 40 });
    expect(score).toBeGreaterThan(75);
  });

  test('danger zone → low score', () => {
    const score = calcSafety({ altmanZ: 0.8, equityRatio: 20, isFinancial: false, netDebtToEbitda: 6, debtToEquityRatio: 2.5, operatingCFToDebt: 10 });
    expect(score).toBeLessThan(35);
  });

  test('financial sector skips Altman, uses equity ratio only', () => {
    const score = calcSafety({ altmanZ: null, equityRatio: 55, isFinancial: true, netDebtToEbitda: null, debtToEquityRatio: 0.5, operatingCFToDebt: 30 });
    expect(score).toBeGreaterThan(50);
  });
});

describe('calcTrend', () => {
  test('S2 + uptrend + B2 → high score', () => {
    const score = calcTrend({ sepaStage: 'S2', dowTrend: 'up', granvilleSignal: 'B2' });
    expect(score).toBeGreaterThan(80);
  });

  test('S4 + downtrend → low score', () => {
    const score = calcTrend({ sepaStage: 'S4', dowTrend: 'down', granvilleSignal: 'S1' });
    expect(score).toBeLessThan(25);
  });

  test('null granville signal → no bonus', () => {
    const score = calcTrend({ sepaStage: 'S1', dowTrend: 'range', granvilleSignal: null });
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(70);
  });
});

describe('calcSupplyDemand', () => {
  test('low margin ratio + high volume → high score', () => {
    const score = calcSupplyDemand({
      marginBalanceRatio: 1.5,
      volumeRatio5d20d: 1.6,
      monteCarloUpProb: 0.75,
    });
    expect(score).toBeGreaterThan(75);
  });

  test('high margin ratio → low score', () => {
    const score = calcSupplyDemand({
      marginBalanceRatio: 12,
      volumeRatio5d20d: 0.7,
      monteCarloUpProb: 0.3,
    });
    expect(score).toBeLessThan(30);
  });
});

describe('calcShareholderReturn', () => {
  test('high yield + growing dividend + buyback → high score', () => {
    const score = calcShareholderReturn({
      dividendYield: 4.5,
      dividendGrowthRate3to5y: 12,
      payoutRatio: 40,
      doe: 5,
      hasBuyback: true,
      buybackRecency: 'within1y',
      totalReturnRatio: 65,
      isNoDividend: false,
    });
    expect(score).toBeGreaterThan(80);
  });

  test('kaou pattern: consecutive increase but low rate → penalized', () => {
    const score = calcShareholderReturn({
      dividendYield: 2.5,
      dividendGrowthRate3to5y: 0.5, // 花王パターン
      payoutRatio: 75,
      doe: 2.5,
      hasBuyback: false,
      buybackRecency: 'none',
      totalReturnRatio: 30,
      isNoDividend: false,
    });
    expect(score).toBeLessThan(50);
  });

  test('no dividend, no buyback → very low', () => {
    const score = calcShareholderReturn({
      dividendYield: 0,
      dividendGrowthRate3to5y: 0,
      payoutRatio: 0,
      doe: 0,
      hasBuyback: false,
      buybackRecency: 'none',
      totalReturnRatio: 0,
      isNoDividend: true,
    });
    expect(score).toBeLessThanOrEqual(20);
  });

  test('no dividend but has buyback → moderate score', () => {
    const score = calcShareholderReturn({
      dividendYield: 0,
      dividendGrowthRate3to5y: 0,
      payoutRatio: 0,
      doe: 0,
      hasBuyback: true,
      buybackRecency: 'within1y',
      totalReturnRatio: 40,
      isNoDividend: true,
    });
    expect(score).toBeGreaterThan(20);
  });
});

describe('stddev', () => {
  test('constant values → 0', () => expect(stddev([10, 10, 10, 10])).toBe(0));
  test('known values', () => expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2));
  test('single value → 0', () => expect(stddev([5])).toBe(0));
});

describe('calcMoat', () => {
  test('stable high-margin company → high score', () => {
    const score = calcMoat({
      operatingMarginHistory: [15, 15.5, 14.8, 15.2, 15.1, 14.9, 15.3, 14.7, 15.0, 15.4],
      roeHistory: [12, 12.5, 11.8, 12.2, 12.1, 11.9, 12.3, 11.7, 12.0, 12.4],
      fcfMarginHistory: [8, 8.2, 7.8, 8.1, 8.3, 7.9, 8.0, 8.4, 7.7, 8.2],
      operatingMarginPercent: 15.0,
      sgaRatioHistory: [20, 20.1, 19.9, 20.2, 20.0, 19.8, 20.3, 19.7, 20.1, 20.0],
    });
    expect(score).toBeGreaterThan(80);
  });

  test('volatile low-margin company → low score', () => {
    const score = calcMoat({
      operatingMarginHistory: [3, 8, -2, 12, 5, -1, 15, 2, 7, -3],
      roeHistory: [5, 15, -5, 20, 3, -2, 18, 1, 10, -8],
      fcfMarginHistory: [2, -5, 8, -3, 10, -7, 5, -2, 12, -4],
      operatingMarginPercent: 3.0,
      sgaRatioHistory: [25, 30, 22, 35, 28, 20, 33, 24, 31, 21],
    });
    expect(score).toBeLessThan(40);
  });
});

describe('calculateAllScores', () => {
  const toyotaSample: AnalysisInput = {
    fundamentals: {
      dcfGapPercent: 12.6, per: 15, pbr: 1.2, ncavToMarketCap: 0.3,
      roe: 18.2, operatingMarginPercent: 9.8, roa: 7.5,
      revenueCagr3y: 3.2, epsCagr3y: 2.1, peg: 1.3,
      equityRatio: 52, altmanZ: 3.2, isFinancial: false,
      ebitda: 5000000,
      ebitdaMargin: 14,
      interestBearingDebt: 2000000,
      cashAndDeposits: 800000,
      netDebtToEbitda: 0.24,
      debtToEquityRatio: 0.5,
      operatingCFToDebt: 38,
      operatingIncomePerEmployee: 6000,
      capexRatio: 7,
      sgaRatio: 18,
      fcfMargin: 9,
      revenueCagr5y: 3.5,
      operatingMarginHistory: [9, 9.5, 10, 9.8, 10.2, 9.7, 10.1, 9.6, 10.3, 9.8],
      roeHistory: [17, 18, 19, 17.5, 18.5, 18.2, 17.8, 19.2, 18.7, 18.0],
      fcfMarginHistory: [7, 7.5, 8, 7.8, 8.2, 7.7, 8.1, 7.6, 8.3, 7.9],
      sgaRatioHistory: [18, 18.2, 17.8, 18.1, 18.3, 17.9, 18.0, 18.4, 17.7, 18.2],
    },
    technical: { sepaStage: 'S2', dowTrend: 'up', granvilleSignal: 'B2' },
    supplyDemand: { marginBalanceRatio: 3.1, volumeRatio5d20d: 1.15, monteCarloUpProb: 0.62 },
    shareholderReturn: {
      dividendYield: 2.8, dividendGrowthRate3to5y: 8, payoutRatio: 32,
      doe: 3.5, hasBuyback: true, buybackRecency: 'within1y',
      totalReturnRatio: 55, isNoDividend: false,
    },
  };

  test('returns all 8 axes', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(Object.keys(scores)).toHaveLength(8);
    for (const v of Object.values(scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test('toyota sample: profitability should be high', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(scores.profitability).toBeGreaterThanOrEqual(55);
  });

  test('toyota sample: moat score is present', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(scores.moat).toBeGreaterThanOrEqual(0);
    expect(scores.moat).toBeLessThanOrEqual(100);
  });
});
