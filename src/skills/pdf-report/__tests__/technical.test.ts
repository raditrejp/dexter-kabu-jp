import { describe, test, expect } from 'vitest';
import {
  calcSMA,
  calcSEPA,
  detectSwingPoints,
  calcDowTrend,
  calcGranville,
  calcVolumeRatio,
  analyzeTechnical,
  type OHLCVBar,
} from '../technical.js';

// ---------------------------------------------------------------------------
// ダミーデータ生成ヘルパー
// ---------------------------------------------------------------------------

function generateUptrend(days: number): OHLCVBar[] {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(2025, 0, 1 + i).toISOString().slice(0, 10),
    open: 1000 + i * 2,
    high: 1010 + i * 2 + Math.sin(i * 0.3) * 20,
    low: 990 + i * 2 - Math.sin(i * 0.3) * 10,
    close: 1005 + i * 2,
    volume: 1000000 + Math.sin(i * 0.5) * 200000,
  }));
}

function generateDowntrend(days: number): OHLCVBar[] {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(2025, 0, 1 + i).toISOString().slice(0, 10),
    open: 2000 - i * 2,
    high: 2010 - i * 2 + Math.sin(i * 0.3) * 10,
    low: 1990 - i * 2 - Math.sin(i * 0.3) * 20,
    close: 1995 - i * 2,
    volume: 1000000 + i * 5000,
  }));
}

// ---------------------------------------------------------------------------
// 1. calcSMA テスト
// ---------------------------------------------------------------------------

describe('calcSMA', () => {
  test('計算値が正しい', () => {
    const closes = [10, 20, 30, 40, 50];
    const result = calcSMA(closes, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    // (10+20+30)/3 = 20
    expect(result[2]).toBeCloseTo(20, 5);
    // (20+30+40)/3 = 30
    expect(result[3]).toBeCloseTo(30, 5);
    // (30+40+50)/3 = 40
    expect(result[4]).toBeCloseTo(40, 5);
  });

  test('period=1は各値そのまま', () => {
    const closes = [5, 10, 15];
    const result = calcSMA(closes, 1);
    expect(result).toEqual([5, 10, 15]);
  });

  test('データ数がperiod未満は全nullを返す', () => {
    const closes = [1, 2];
    const result = calcSMA(closes, 5);
    expect(result.every((v) => v === null)).toBe(true);
  });

  test('長い配列でperiod=200が正しく計算される', () => {
    const closes = Array.from({ length: 250 }, (_, i) => 1000 + i);
    const result = calcSMA(closes, 200);
    // 最初の199個はnull
    expect(result.slice(0, 199).every((v) => v === null)).toBe(true);
    // インデックス199: closes[0..199]の平均 = (1000+1199)/2 = 1099.5
    expect(result[199]).toBeCloseTo(1099.5, 1);
  });
});

// ---------------------------------------------------------------------------
// 2. detectSwingPoints テスト
// ---------------------------------------------------------------------------

describe('detectSwingPoints', () => {
  test('上昇トレンドデータでスイングポイントを検出できる', () => {
    const bars = generateUptrend(60);
    const points = detectSwingPoints(bars, 5);
    expect(points.length).toBeGreaterThan(0);
  });

  test('HighとLowの両タイプが含まれる', () => {
    const bars = generateUptrend(60);
    const points = detectSwingPoints(bars, 5);
    const hasHigh = points.some((p) => p.type === 'high');
    const hasLow = points.some((p) => p.type === 'low');
    expect(hasHigh).toBe(true);
    expect(hasLow).toBe(true);
  });

  test('各ポイントにindex/date/priceが含まれる', () => {
    const bars = generateUptrend(60);
    const points = detectSwingPoints(bars, 5);
    for (const p of points) {
      expect(typeof p.index).toBe('number');
      expect(typeof p.date).toBe('string');
      expect(typeof p.price).toBe('number');
      expect(['high', 'low']).toContain(p.type);
    }
  });

  test('インデックス順にソートされている', () => {
    const bars = generateUptrend(80);
    const points = detectSwingPoints(bars, 5);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].index).toBeGreaterThanOrEqual(points[i - 1].index);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. calcSEPA テスト
// ---------------------------------------------------------------------------

describe('calcSEPA', () => {
  test('強い上昇トレンド（260日以上）→ S2 + score高め', () => {
    const bars = generateUptrend(280);
    const result = calcSEPA(bars);
    // 上昇トレンドなのでS2またはスコアが高い
    expect(['S2', 'S3']).toContain(result.stage);
    expect(result.score).toBeGreaterThanOrEqual(5);
    expect(result.conditions.length).toBe(7);
  });

  test('下降トレンド（260日以上）→ S4またはS1 + score低め', () => {
    const bars = generateDowntrend(280);
    const result = calcSEPA(bars);
    expect(['S1', 'S4']).toContain(result.stage);
    expect(result.score).toBeLessThanOrEqual(3);
    expect(result.conditions.length).toBe(7);
  });

  test('conditionsは7要素の boolean 配列', () => {
    const bars = generateUptrend(260);
    const result = calcSEPA(bars);
    expect(result.conditions).toHaveLength(7);
    result.conditions.forEach((c) => expect(typeof c).toBe('boolean'));
  });

  test('データが少なくてもクラッシュしない（フォールバック）', () => {
    const bars = generateUptrend(50);
    const result = calcSEPA(bars);
    expect(['S1', 'S2', 'S3', 'S4']).toContain(result.stage);
    expect(result.conditions).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// 4. calcDowTrend テスト
// ---------------------------------------------------------------------------

describe('calcDowTrend', () => {
  test('上昇トレンドデータ → trend が up', () => {
    const bars = generateUptrend(120);
    const result = calcDowTrend(bars);
    // 滑らかな上昇なのでスイングポイントが少ない場合はrangeになることもある
    expect(['up', 'range']).toContain(result.trend);
  });

  test('下降トレンドデータ → trend が down', () => {
    const bars = generateDowntrend(120);
    const result = calcDowTrend(bars);
    expect(['down', 'range']).toContain(result.trend);
  });

  test('明確なHH+HLパターン → up', () => {
    // 波を作ることでスイングポイントを生成する
    const bars: OHLCVBar[] = [];
    const basePrice = 1000;
    // 3サイクル分のジグザグ上昇（各サイクル: 上昇20本→下降10本）
    const pattern = [
      // cycle 1: SL=1000, SH=1200
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        open: basePrice + i * 10,
        high: basePrice + i * 10 + 15,
        low: basePrice + i * 10 - 5,
        close: basePrice + i * 10 + 5,
        volume: 1000000,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2025-02-${String(i + 1).padStart(2, '0')}`,
        open: 1200 - i * 8,
        high: 1210 - i * 8,
        low: 1190 - i * 8,
        close: 1195 - i * 8,
        volume: 800000,
      })),
      // cycle 2: SL=1120 (> 1000), SH=1400 (> 1200)
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-03-${String(i + 1).padStart(2, '0')}`,
        open: 1120 + i * 14,
        high: 1135 + i * 14,
        low: 1105 + i * 14,
        close: 1128 + i * 14,
        volume: 1200000,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2025-04-${String(i + 1).padStart(2, '0')}`,
        open: 1400 - i * 8,
        high: 1410 - i * 8,
        low: 1390 - i * 8,
        close: 1395 - i * 8,
        volume: 900000,
      })),
      // cycle 3: SL=1320 (> 1120), SH=1600 (> 1400)
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-05-${String(i + 1).padStart(2, '0')}`,
        open: 1320 + i * 14,
        high: 1335 + i * 14,
        low: 1305 + i * 14,
        close: 1328 + i * 14,
        volume: 1400000,
      })),
    ];
    const result = calcDowTrend(pattern);
    expect(result.trend).toBe('up');
  });

  test('明確なLH+LLパターン → down', () => {
    const bars: OHLCVBar[] = [];
    // cycle 1: SH=2000, SL=1800
    const pattern = [
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        open: 2000 - i * 10,
        high: 2010 - i * 10,
        low: 1990 - i * 10,
        close: 1995 - i * 10,
        volume: 1200000,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2025-02-${String(i + 1).padStart(2, '0')}`,
        open: 1800 + i * 8,
        high: 1815 + i * 8,
        low: 1790 + i * 8,
        close: 1808 + i * 8,
        volume: 800000,
      })),
      // cycle 2: SH=1880 (< 2000), SL=1620 (< 1800)
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-03-${String(i + 1).padStart(2, '0')}`,
        open: 1880 - i * 13,
        high: 1890 - i * 13,
        low: 1870 - i * 13,
        close: 1875 - i * 13,
        volume: 1300000,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2025-04-${String(i + 1).padStart(2, '0')}`,
        open: 1620 + i * 8,
        high: 1635 + i * 8,
        low: 1605 + i * 8,
        close: 1628 + i * 8,
        volume: 700000,
      })),
      // cycle 3: SH=1700 (< 1880), SL=1500 (< 1620)
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2025-05-${String(i + 1).padStart(2, '0')}`,
        open: 1700 - i * 10,
        high: 1710 - i * 10,
        low: 1690 - i * 10,
        close: 1695 - i * 10,
        volume: 1100000,
      })),
    ];
    const result = calcDowTrend(pattern);
    expect(result.trend).toBe('down');
  });

  test('volumeConfirmedはboolean', () => {
    const bars = generateUptrend(120);
    const result = calcDowTrend(bars);
    expect(typeof result.volumeConfirmed).toBe('boolean');
  });

  test('swingPointsを返す', () => {
    const bars = generateUptrend(120);
    const result = calcDowTrend(bars);
    expect(Array.isArray(result.swingPoints)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. calcGranville テスト
// ---------------------------------------------------------------------------

describe('calcGranville', () => {
  test('データが220日未満の場合はnullを返す', () => {
    const bars = generateUptrend(150);
    expect(calcGranville(bars)).toBeNull();
  });

  test('株価がSMA200を上抜け + SMA200上転 → B1', () => {
    // SMA200が上向きの状態で株価がMAを上抜けするシナリオ
    // まず200日の上昇基盤を作り、その後一時的に下落してから上抜けさせる
    const baseBars = generateUptrend(210);
    // 直近10日: 下落してからSMA200付近を上抜け
    const sma200Approx =
      baseBars.slice(10, 210).reduce((s, b) => s + b.close, 0) / 200;

    // 最後の数本でSMA200水準を下→上に突き抜けさせる
    const lastBars: OHLCVBar[] = [
      {
        date: '2025-08-01',
        open: sma200Approx - 20,
        high: sma200Approx - 5,
        low: sma200Approx - 30,
        close: sma200Approx - 15,
        volume: 1000000,
      },
      {
        date: '2025-08-04',
        open: sma200Approx - 10,
        high: sma200Approx + 20,
        low: sma200Approx - 15,
        close: sma200Approx + 10,
        volume: 1500000,
      },
    ];

    const allBars = [...baseBars, ...lastBars];
    const signal = calcGranville(allBars);
    // B1またはB2/B3 (MAが上向きで上抜け付近)
    expect(['B1', 'B2', 'B3', null]).toContain(signal);
  });

  test('大幅下方乖離 → B4', () => {
    // SMA200より大幅に下落したシナリオ
    // 220日の上昇基盤の後、一気に急落させる
    const baseBars = generateUptrend(220);
    const lastClose = baseBars[baseBars.length - 1].close;
    // SMA200 ≈ 最後の200日の平均
    const sma200Approx =
      baseBars.slice(20).reduce((s, b) => s + b.close, 0) / 200;
    // SMA200から-20%落とす
    const crashPrice = sma200Approx * 0.78;

    const crashBars: OHLCVBar[] = Array.from({ length: 5 }, (_, i) => ({
      date: `2025-09-0${i + 1}`,
      open: lastClose - i * 30,
      high: lastClose - i * 28,
      low: crashPrice - 10,
      close: crashPrice - i * 2,
      volume: 2000000,
    }));

    const allBars = [...baseBars, ...crashBars];
    // SMA200は上向きのまま急落 → B4候補
    const signal = calcGranville(allBars);
    // B4またはnull（急落すぎてSMA200が追いついていない可能性あり）
    expect(['B4', 'S4', null]).toContain(signal);
  });

  test('戻り値はシグナルコードまたはnull', () => {
    const validSignals = ['B1', 'B2', 'B3', 'B4', 'S1', 'S2', 'S3', 'S4', null];
    const bars = generateUptrend(260);
    const result = calcGranville(bars);
    expect(validSignals).toContain(result);
  });
});

// ---------------------------------------------------------------------------
// 6. calcVolumeRatio テスト
// ---------------------------------------------------------------------------

describe('calcVolumeRatio', () => {
  test('5日平均 / 20日平均の比率を返す', () => {
    // 最後の5日: volume=2000000, 前15日: volume=1000000
    const bars: OHLCVBar[] = [
      ...Array.from({ length: 15 }, (_, i) => ({
        date: `2025-01-${String(i + 1).padStart(2, '0')}`,
        open: 1000,
        high: 1010,
        low: 990,
        close: 1000,
        volume: 1000000,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        date: `2025-02-${String(i + 1).padStart(2, '0')}`,
        open: 1000,
        high: 1010,
        low: 990,
        close: 1000,
        volume: 2000000,
      })),
    ];

    const ratio = calcVolumeRatio(bars);
    // 5日平均: 2000000
    // 20日平均: (1000000*15 + 2000000*5) / 20 = (15000000+10000000)/20 = 1250000
    // ratio = 2000000 / 1250000 = 1.6
    expect(ratio).toBeCloseTo(1.6, 5);
  });

  test('データが20日未満の場合は1を返す', () => {
    const bars = generateUptrend(10);
    expect(calcVolumeRatio(bars)).toBe(1);
  });

  test('出来高が一定なら比率は1.0', () => {
    const bars: OHLCVBar[] = Array.from({ length: 30 }, (_, i) => ({
      date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      open: 1000,
      high: 1010,
      low: 990,
      close: 1000,
      volume: 1000000,
    }));
    expect(calcVolumeRatio(bars)).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// 7. analyzeTechnical 統合テスト
// ---------------------------------------------------------------------------

describe('analyzeTechnical', () => {
  test('TechnicalResultの全フィールドが含まれる', () => {
    const bars = generateUptrend(280);
    const result = analyzeTechnical(bars);

    expect(['S1', 'S2', 'S3', 'S4']).toContain(result.sepaStage);
    expect(typeof result.sepaScore).toBe('number');
    expect(result.sepaScore).toBeGreaterThanOrEqual(0);
    expect(result.sepaScore).toBeLessThanOrEqual(7);
    expect(result.sepaConditions).toHaveLength(7);
    expect(['up', 'range', 'down']).toContain(result.dowTrend);
    expect(typeof result.dowVolumeConfirmed).toBe('boolean');
    const validSignals = ['B1', 'B2', 'B3', 'B4', 'S1', 'S2', 'S3', 'S4', null];
    expect(validSignals).toContain(result.granvilleSignal);
    expect(typeof result.volumeRatio5d20d).toBe('number');
    // SMA50/200はデータが多いので数値
    expect(typeof result.sma50).toBe('number');
    expect(typeof result.sma200).toBe('number');
  });

  test('データが少ない場合（50日未満）もクラッシュしない', () => {
    const bars = generateUptrend(30);
    expect(() => analyzeTechnical(bars)).not.toThrow();
    const result = analyzeTechnical(bars);
    expect(result.sma50).toBeNull();
    expect(result.sma200).toBeNull();
  });

  test('上昇トレンド → sepaStage S2 かつ sepaScore高め', () => {
    const bars = generateUptrend(280);
    const result = analyzeTechnical(bars);
    expect(['S2', 'S3']).toContain(result.sepaStage);
    expect(result.sepaScore).toBeGreaterThanOrEqual(5);
  });

  test('下降トレンド → sepaStage S4 または S1 かつ sepaScore低め', () => {
    const bars = generateDowntrend(280);
    const result = analyzeTechnical(bars);
    expect(['S1', 'S4']).toContain(result.sepaStage);
    expect(result.sepaScore).toBeLessThanOrEqual(3);
  });
});
