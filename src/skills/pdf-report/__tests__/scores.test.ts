import { describe, test, expect } from 'vitest';
import type { AnalysisInput, SevenAxisScores } from '../scores.js';
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
  calculateAllScores,
} from '../scores.js';

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
      },
      industryAvg: {
        per: 20,
        operatingMarginPercent: 7.5,
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

  test('SevenAxisScores has all 7 keys', () => {
    const scores: SevenAxisScores = {
      valuation: 72,
      profitability: 85,
      growth: 45,
      safety: 78,
      trend: 68,
      supplyDemand: 62,
      shareholderReturn: 75,
    };
    expect(Object.keys(scores)).toHaveLength(7);
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
      { dcfGapPercent: 30, per: 15, pbr: 0.8, ncavToMarketCap: 0.3 },
      { per: 20 },
    );
    // DCF: 90 * 0.6 = 54, PER: 75 * 0.2 = 15, PBR: +5 * 0.1 = 0.5, NN: 0 * 0.1 = 0
    expect(score).toBeGreaterThan(65);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('DCF -30% gap → low score', () => {
    const score = calcValuation(
      { dcfGapPercent: -30, per: 30, pbr: 3.0, ncavToMarketCap: 0.2 },
      { per: 20 },
    );
    expect(score).toBeLessThan(30);
  });

  test('net-net stock gets large bonus', () => {
    const withNetNet = calcValuation(
      { dcfGapPercent: 0, per: 20, pbr: 0.4, ncavToMarketCap: 1.6 },
      { per: 20 },
    );
    const withoutNetNet = calcValuation(
      { dcfGapPercent: 0, per: 20, pbr: 0.4, ncavToMarketCap: 0.3 },
      { per: 20 },
    );
    expect(withNetNet - withoutNetNet).toBeGreaterThan(5);
  });

  test('result clamped to 0-100', () => {
    const score = calcValuation(
      { dcfGapPercent: 100, per: 5, pbr: 0.3, ncavToMarketCap: 2.0 },
      { per: 20 },
    );
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('calcProfitability', () => {
  test('high ROE + high margin → high score', () => {
    const score = calcProfitability(
      { roe: 20, operatingMarginPercent: 15, roa: 8 },
      { operatingMarginPercent: 7.5 },
    );
    expect(score).toBeGreaterThan(80);
  });

  test('low ROE → low score', () => {
    const score = calcProfitability(
      { roe: 3, operatingMarginPercent: 2, roa: 1 },
      { operatingMarginPercent: 7.5 },
    );
    expect(score).toBeLessThan(30);
  });
});

describe('calcGrowth', () => {
  test('high growth → high score', () => {
    const score = calcGrowth({ revenueCagr3y: 15, epsCagr3y: 20, peg: 0.8 });
    expect(score).toBeGreaterThan(80);
  });

  test('negative growth → low score', () => {
    const score = calcGrowth({ revenueCagr3y: -5, epsCagr3y: -3, peg: null });
    expect(score).toBeLessThan(30);
  });

  test('PEG null → no bonus/penalty', () => {
    const withPeg = calcGrowth({ revenueCagr3y: 8, epsCagr3y: 8, peg: 0.5 });
    const noPeg = calcGrowth({ revenueCagr3y: 8, epsCagr3y: 8, peg: null });
    expect(withPeg).toBeGreaterThan(noPeg);
  });
});

describe('calcSafety', () => {
  test('safe zone Altman + high equity ratio', () => {
    const score = calcSafety({ altmanZ: 3.2, equityRatio: 55, isFinancial: false });
    expect(score).toBeGreaterThan(75);
  });

  test('danger zone → low score', () => {
    const score = calcSafety({ altmanZ: 0.8, equityRatio: 20, isFinancial: false });
    expect(score).toBeLessThan(25);
  });

  test('financial sector skips Altman, uses equity ratio only', () => {
    const score = calcSafety({ altmanZ: null, equityRatio: 55, isFinancial: true });
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

describe('calculateAllScores', () => {
  const toyotaSample: AnalysisInput = {
    fundamentals: {
      dcfGapPercent: 12.6, per: 15, pbr: 1.2, ncavToMarketCap: 0.3,
      roe: 18.2, operatingMarginPercent: 9.8, roa: 7.5,
      revenueCagr3y: 3.2, epsCagr3y: 2.1, peg: 1.3,
      equityRatio: 52, altmanZ: 3.2, isFinancial: false,
    },
    industryAvg: { per: 20, operatingMarginPercent: 7.5 },
    technical: { sepaStage: 'S2', dowTrend: 'up', granvilleSignal: 'B2' },
    supplyDemand: { marginBalanceRatio: 3.1, volumeRatio5d20d: 1.15, monteCarloUpProb: 0.62 },
    shareholderReturn: {
      dividendYield: 2.8, dividendGrowthRate3to5y: 8, payoutRatio: 32,
      doe: 3.5, hasBuyback: true, buybackRecency: 'within1y',
      totalReturnRatio: 55, isNoDividend: false,
    },
  };

  test('returns all 7 axes', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(Object.keys(scores)).toHaveLength(7);
    for (const v of Object.values(scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test('toyota sample: profitability should be high', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(scores.profitability).toBeGreaterThan(70);
  });
});
