/**
 * テクニカル分析自動計算モジュール
 * JQuantsの日足OHLCVデータからSEPA・ダウ理論・グランビルの法則を計算する
 */

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalResult {
  sepaStage: 'S1' | 'S2' | 'S3' | 'S4';
  sepaScore: number;          // 0-7（Pass数）
  sepaConditions: boolean[];  // 7条件の合否
  dowTrend: 'up' | 'range' | 'down';
  dowVolumeConfirmed: boolean;
  granvilleSignal: 'B1' | 'B2' | 'B3' | 'B4' | 'S1' | 'S2' | 'S3' | 'S4' | null;
  volumeRatio5d20d: number;  // 5日平均出来高 / 20日平均出来高
  // 算出した移動平均（PDFチャート用）
  sma50: number | null;
  sma200: number | null;
}

export interface SwingPoint {
  index: number;
  date: string;
  price: number;
  type: 'high' | 'low';
}

// ---------------------------------------------------------------------------
// 1. SMA計算
// ---------------------------------------------------------------------------

/**
 * closes配列に対してperiod日の単純移動平均を計算する
 * period未満のインデックスはnull
 */
export function calcSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      const slice = closes.slice(i - period + 1, i + 1);
      const sum = slice.reduce((acc, v) => acc + v, 0);
      result.push(sum / period);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. SEPA 7条件判定 + ステージ分類
// ---------------------------------------------------------------------------

/**
 * SEPA（Minervini トレンドテンプレート）7条件判定とStanstein ステージ分類
 * 推奨: 260日以上のデータ。200日あればSMA200は1点計算可能。
 */
export function calcSEPA(bars: OHLCVBar[]): {
  stage: 'S1' | 'S2' | 'S3' | 'S4';
  score: number;
  conditions: boolean[];
} {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const n = closes.length;

  const sma50Arr = calcSMA(closes, 50);
  const sma150Arr = calcSMA(closes, 150);
  const sma200Arr = calcSMA(closes, 200);

  const currentClose = closes[n - 1];
  const sma50 = sma50Arr[n - 1];
  const sma150 = sma150Arr[n - 1];
  const sma200 = sma200Arr[n - 1];

  // SMA200の20営業日前の値
  const sma200_20dAgo =
    n >= 220 ? sma200Arr[n - 1 - 20] : null;

  // 52週（260営業日）の高値・安値
  const lookback52w = Math.min(260, n);
  const week52High = Math.max(...highs.slice(n - lookback52w));
  const week52Low = Math.min(...lows.slice(n - lookback52w));

  // 7条件判定
  const conditions: boolean[] = [
    // 1. 現在値 > SMA150 かつ 現在値 > SMA200
    sma150 !== null && sma200 !== null
      ? currentClose > sma150 && currentClose > sma200
      : false,
    // 2. SMA150 > SMA200
    sma150 !== null && sma200 !== null ? sma150 > sma200 : false,
    // 3. SMA200が上向き（20営業日前のSMA200 < 現在のSMA200）
    sma200 !== null && sma200_20dAgo !== null
      ? (sma200_20dAgo as number) < sma200
      : false,
    // 4. SMA50 > SMA150 かつ SMA50 > SMA200
    sma50 !== null && sma150 !== null && sma200 !== null
      ? sma50 > sma150 && sma50 > sma200
      : false,
    // 5. 現在値 > SMA50
    sma50 !== null ? currentClose > sma50 : false,
    // 6. 現在値が52週安値から25%以上高い
    (currentClose - week52Low) / week52Low >= 0.25,
    // 7. 現在値が52週高値の25%以内
    (week52High - currentClose) / week52High <= 0.25,
  ];

  const score = conditions.filter(Boolean).length;

  // ステージ判定
  const sma200Rising =
    sma200 !== null && sma200_20dAgo !== null
      ? sma200 > (sma200_20dAgo as number)
      : null;
  const sma200Flat =
    sma200 !== null && sma200_20dAgo !== null
      ? Math.abs(sma200 - (sma200_20dAgo as number)) / (sma200_20dAgo as number) <=
        0.005
      : null;
  const aboveSMA200 = sma200 !== null ? currentClose > sma200 : null;

  let stage: 'S1' | 'S2' | 'S3' | 'S4';

  if (sma200Rising && aboveSMA200 && score >= 5) {
    // S2: 上昇
    stage = 'S2';
  } else if (sma200Rising && score >= 3 && score <= 5) {
    // S3: 天井形成（上向きだが傾き鈍化 or スコア中程度）
    stage = 'S3';
  } else if (!sma200Rising && !aboveSMA200 && score <= 2) {
    // S4: 下落
    stage = 'S4';
  } else if ((sma200Flat || !sma200Rising) && score <= 2) {
    // S1: 底固め
    stage = 'S1';
  } else {
    // フォールバック: スコアで判定
    if (score >= 5) stage = 'S2';
    else if (score >= 3) stage = 'S3';
    else if (aboveSMA200 === false) stage = 'S4';
    else stage = 'S1';
  }

  return { stage, score, conditions };
}

// ---------------------------------------------------------------------------
// 3. ダウ理論
// ---------------------------------------------------------------------------

/**
 * スイングハイ・スイングローを検出する
 * @param bars OHLCVデータ
 * @param n 前後N本と比較（デフォルト5）
 */
export function detectSwingPoints(
  bars: OHLCVBar[],
  n: number = 5
): SwingPoint[] {
  const points: SwingPoint[] = [];

  for (let i = n; i < bars.length - n; i++) {
    const bar = bars[i];

    // スイングハイ: 前後n本の高値より高い
    let isSwingHigh = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j !== i && bars[j].high >= bar.high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      points.push({ index: i, date: bar.date, price: bar.high, type: 'high' });
    }

    // スイングロー: 前後n本の安値より安い
    let isSwingLow = true;
    for (let j = i - n; j <= i + n; j++) {
      if (j !== i && bars[j].low <= bar.low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      points.push({ index: i, date: bar.date, price: bar.low, type: 'low' });
    }
  }

  // インデックス順にソート
  points.sort((a, b) => a.index - b.index);

  return points;
}

/**
 * ダウ理論によるトレンド判定
 */
export function calcDowTrend(bars: OHLCVBar[]): {
  trend: 'up' | 'range' | 'down';
  volumeConfirmed: boolean;
  swingPoints: SwingPoint[];
} {
  const allPoints = detectSwingPoints(bars);

  // ハイ・ローをそれぞれ分離して直近3点取得
  const highs = allPoints.filter((p) => p.type === 'high').slice(-3);
  const lows = allPoints.filter((p) => p.type === 'low').slice(-3);

  let trend: 'up' | 'range' | 'down' = 'range';

  if (highs.length >= 2 && lows.length >= 2) {
    const recentHH = highs[highs.length - 1].price > highs[highs.length - 2].price; // HH
    const recentHL = lows[lows.length - 1].price > lows[lows.length - 2].price;     // HL
    const recentLH = highs[highs.length - 1].price < highs[highs.length - 2].price; // LH
    const recentLL = lows[lows.length - 1].price < lows[lows.length - 2].price;     // LL

    if (recentHH && recentHL) {
      trend = 'up';
    } else if (recentLH && recentLL) {
      trend = 'down';
    } else {
      trend = 'range';
    }
  }

  // 出来高確認: 上昇区間と下降区間の平均出来高を比較
  let volumeConfirmed = false;
  const allSortedPoints = allPoints.slice(-6); // 直近6スイングポイント

  if (allSortedPoints.length >= 2) {
    let upSectionVolume = 0;
    let upSectionCount = 0;
    let downSectionVolume = 0;
    let downSectionCount = 0;

    for (let i = 0; i < allSortedPoints.length - 1; i++) {
      const from = allSortedPoints[i];
      const to = allSortedPoints[i + 1];
      const sectionBars = bars.slice(from.index, to.index + 1);
      const avgVol =
        sectionBars.reduce((sum, b) => sum + b.volume, 0) / sectionBars.length;

      if (to.price > from.price) {
        // 上昇区間
        upSectionVolume += avgVol;
        upSectionCount++;
      } else {
        // 下降区間
        downSectionVolume += avgVol;
        downSectionCount++;
      }
    }

    const avgUp = upSectionCount > 0 ? upSectionVolume / upSectionCount : 0;
    const avgDown =
      downSectionCount > 0 ? downSectionVolume / downSectionCount : 0;

    if (trend === 'up') {
      volumeConfirmed = avgUp > avgDown;
    } else if (trend === 'down') {
      volumeConfirmed = avgDown > avgUp;
    } else {
      volumeConfirmed = false;
    }
  }

  return { trend, volumeConfirmed, swingPoints: allPoints };
}

// ---------------------------------------------------------------------------
// 4. グランビル8法則
// ---------------------------------------------------------------------------

/**
 * グランビルの法則により直近10営業日以内のシグナルを検出する
 * SMA200ベースの判定
 */
export function calcGranville(
  bars: OHLCVBar[]
): 'B1' | 'B2' | 'B3' | 'B4' | 'S1' | 'S2' | 'S3' | 'S4' | null {
  const closes = bars.map((b) => b.close);
  const n = closes.length;

  if (n < 220) return null; // SMA200 + 20日の傾き計算に必要

  const sma200Arr = calcSMA(closes, 200);

  // 直近10営業日のインデックス範囲
  const lookback = Math.min(10, n - 1);

  for (let offset = 0; offset < lookback; offset++) {
    const i = n - 1 - offset;
    if (i < 1) continue;

    const sma200 = sma200Arr[i];
    const sma200Prev = sma200Arr[i - 1];
    const sma200_20dAgo = i >= 20 ? sma200Arr[i - 20] : null;

    if (sma200 === null || sma200Prev === null) continue;

    const close = closes[i];
    const closePrev = closes[i - 1];

    // SMA200の傾き判定
    // 横ばい: 差が0.5%以内
    const sma200Slope =
      sma200_20dAgo !== null
        ? (sma200 - (sma200_20dAgo as number)) / (sma200_20dAgo as number)
        : 0;
    const sma200IsFlat = Math.abs(sma200Slope) <= 0.005;
    const sma200IsRising = sma200Slope > 0.005;
    const sma200IsFalling = sma200Slope < -0.005;

    // 乖離率
    const deviation = ((close - sma200) / sma200) * 100;

    // 株価がSMA200を上抜けたか（前日は下、当日は上）
    const crossedAbove = closePrev < (sma200Prev as number) && close >= sma200;
    // 株価がSMA200を下抜けたか（前日は上、当日は下）
    const crossedBelow = closePrev > (sma200Prev as number) && close <= sma200;

    // 株価がSMA200付近（±3%以内）で反発/反落
    const nearMA = Math.abs(deviation) <= 3;

    // B1: MAが下向き→横ばい→上向きに転じ、株価がMAを上抜け
    if ((sma200IsRising || sma200IsFlat) && crossedAbove) {
      return 'B1';
    }

    // S1: MAが上向き→横ばい→下向きに転じ、株価がMAを下抜け
    if ((sma200IsFalling || sma200IsFlat) && crossedBelow) {
      return 'S1';
    }

    // B2: MAが上向き、株価がMA付近まで下落して反発
    if (sma200IsRising && nearMA && close > sma200 && closePrev <= close) {
      return 'B2';
    }

    // B3: MAが上向き、株価がMAに接近（割り込まず）して反発
    if (sma200IsRising && deviation > 0 && deviation <= 5 && closePrev <= close) {
      return 'B3';
    }

    // S2: MAが下向き、株価がMA付近まで上昇して反落
    if (sma200IsFalling && nearMA && close < sma200 && closePrev >= close) {
      return 'S2';
    }

    // S3: MAが下向き、株価がMAに接近（超えず）して反落
    if (sma200IsFalling && deviation < 0 && deviation >= -5 && closePrev >= close) {
      return 'S3';
    }

    // B4: MAが下向き、株価がMAから大きく下方乖離（乖離率 -15%超）
    if (sma200IsFalling && deviation <= -15) {
      return 'B4';
    }

    // S4: MAが上向き、株価がMAから大きく上方乖離（乖離率 +15%超）
    if (sma200IsRising && deviation >= 15) {
      return 'S4';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 5. 出来高トレンド
// ---------------------------------------------------------------------------

/**
 * 直近5日平均出来高 / 直近20日平均出来高
 */
export function calcVolumeRatio(bars: OHLCVBar[]): number {
  const n = bars.length;
  if (n < 20) return 1;

  const recent5 = bars.slice(n - 5).reduce((sum, b) => sum + b.volume, 0) / 5;
  const recent20 = bars.slice(n - 20).reduce((sum, b) => sum + b.volume, 0) / 20;

  if (recent20 === 0) return 1;
  return recent5 / recent20;
}

// ---------------------------------------------------------------------------
// 6. 統合関数
// ---------------------------------------------------------------------------

/**
 * 全テクニカル指標を計算してTechnicalResultを返す
 * データが不足している場合（200日未満）はSEPA/グランビルを簡易判定
 */
export function analyzeTechnical(bars: OHLCVBar[]): TechnicalResult {
  const closes = bars.map((b) => b.close);
  const n = closes.length;

  // SMA計算（PDFチャート用）
  const sma50Arr = calcSMA(closes, 50);
  const sma200Arr = calcSMA(closes, 200);
  const sma50 = n >= 50 ? (sma50Arr[n - 1] as number) : null;
  const sma200 = n >= 200 ? (sma200Arr[n - 1] as number) : null;

  // SEPA
  const sepaResult = calcSEPA(bars);

  // ダウ理論
  const dowResult = calcDowTrend(bars);

  // グランビル
  const granvilleSignal = calcGranville(bars);

  // 出来高比率
  const volumeRatio5d20d = calcVolumeRatio(bars);

  return {
    sepaStage: sepaResult.stage,
    sepaScore: sepaResult.score,
    sepaConditions: sepaResult.conditions,
    dowTrend: dowResult.trend,
    dowVolumeConfirmed: dowResult.volumeConfirmed,
    granvilleSignal,
    volumeRatio5d20d,
    sma50,
    sma200,
  };
}
