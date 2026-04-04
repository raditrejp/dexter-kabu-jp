/** 分析フェーズから受け取る入力データ */
export interface AnalysisInput {
  fundamentals: {
    dcfGapPercent: number;       // DCF乖離率（%）正=割安
    per: number;
    pbr: number;
    ncavToMarketCap: number;     // NCAV/時価総額
    roe: number;                 // %
    operatingMarginPercent: number;
    roa: number;                 // %
    revenueCagr3y: number;       // 売上3年CAGR（%）
    epsCagr3y: number;           // EPS3年CAGR（%）
    peg: number | null;          // null=算出不可
    equityRatio: number;         // 自己資本比率（%）
    altmanZ: number | null;      // null=金融業でスキップ
    isFinancial: boolean;
  };
  industryAvg: {
    per: number;
    operatingMarginPercent: number;
  };
  technical: {
    sepaStage: 'S1' | 'S2' | 'S3' | 'S4';
    dowTrend: 'up' | 'range' | 'down';
    granvilleSignal: 'B1' | 'B2' | 'B3' | 'B4' | 'S1' | 'S2' | 'S3' | 'S4' | null;
  };
  supplyDemand: {
    marginBalanceRatio: number;  // 信用倍率
    volumeRatio5d20d: number;    // 5日平均/20日平均（1.0=同等）
    monteCarloUpProb: number;    // 0〜1
  };
  shareholderReturn: {
    dividendYield: number;       // %
    dividendGrowthRate3to5y: number; // 年平均増配率（%）
    payoutRatio: number;         // 配当性向（%）
    doe: number;                 // DOE（%）
    hasBuyback: boolean;
    buybackRecency: 'within1y' | 'within3y' | 'none';
    totalReturnRatio: number;    // 総還元性向（%）
    isNoDividend: boolean;
  };
}

/** 7軸スコア（各0〜100） */
export interface SevenAxisScores {
  valuation: number;
  profitability: number;
  growth: number;
  safety: number;
  trend: number;
  supplyDemand: number;
  shareholderReturn: number;
}

/** 値をmin〜maxの範囲にクランプ */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 入力値を[inMin, inMax]から[outMin, outMax]に線形変換。範囲外はクランプ。 */
export function lerp(
  value: number,
  inMin: number, inMax: number,
  outMin: number, outMax: number,
): number {
  const t = (value - inMin) / (inMax - inMin);
  const clamped = Math.min(Math.max(t, 0), 1);
  return outMin + clamped * (outMax - outMin);
}

export function calcValuation(
  data: Pick<AnalysisInput['fundamentals'], 'dcfGapPercent' | 'per' | 'pbr' | 'ncavToMarketCap'>,
  industry: Pick<AnalysisInput['industryAvg'], 'per'>,
): number {
  // 主指標: DCF乖離率（60%）— -30→10, 0→50, +30→90
  const dcfScore = lerp(data.dcfGapPercent, -30, 30, 10, 90);

  // 補助: PER vs業界平均（20%）— 低い方が高スコア
  const perRatio = data.per / industry.per;
  const perScore = lerp(perRatio, 0.5, 1.5, 90, 10);

  // 補助: PBR（10%）— スコアとして扱う
  let pbrScore: number;
  if (data.pbr <= 0.5) pbrScore = 90;
  else if (data.pbr <= 1.0) pbrScore = 65;
  else pbrScore = 40;

  // 補助: ネットネット判定（10%）— スコアとして扱う
  let nnScore: number;
  const nn = data.ncavToMarketCap;
  if (nn > 1.5) nnScore = 90;
  else if (nn >= 1.0) nnScore = 70;
  else if (nn >= 0.67) nnScore = 55;
  else nnScore = 30;

  const raw = dcfScore * 0.6 + perScore * 0.2 + pbrScore * 0.1 + nnScore * 0.1;
  return clamp(Math.round(raw), 0, 100);
}

export function calcProfitability(
  data: Pick<AnalysisInput['fundamentals'], 'roe' | 'operatingMarginPercent' | 'roa'>,
  industry: Pick<AnalysisInput['industryAvg'], 'operatingMarginPercent'>,
): number {
  // 主指標: ROE（50%）
  let roeScore: number;
  if (data.roe >= 20) roeScore = 90;
  else if (data.roe >= 15) roeScore = 80;
  else if (data.roe >= 10) roeScore = 60;
  else if (data.roe >= 5) roeScore = 40;
  else roeScore = 20;

  // 補助: 営業利益率 vs業界平均（30%）
  const marginRatio = data.operatingMarginPercent / industry.operatingMarginPercent;
  const marginScore = lerp(marginRatio, 0.5, 2.0, 10, 90);

  // 補助: ROA（20%）— スコアとして扱う
  let roaScore: number;
  if (data.roa >= 8) roaScore = 80;
  else if (data.roa >= 5) roaScore = 75;
  else roaScore = 30;

  const raw = roeScore * 0.5 + marginScore * 0.3 + roaScore * 0.2;
  return clamp(Math.round(raw), 0, 100);
}

function cagrToScore(cagr: number): number {
  if (cagr >= 15) return 90;
  if (cagr >= 10) return 80;
  if (cagr >= 5) return 60;
  if (cagr >= 0) return 40;
  return 20;
}

export function calcGrowth(
  data: Pick<AnalysisInput['fundamentals'], 'revenueCagr3y' | 'epsCagr3y' | 'peg'>,
): number {
  // 主指標: 売上CAGR（40%）
  const revenueScore = cagrToScore(data.revenueCagr3y);

  // 補助: EPS成長率（40%）
  const epsScore = cagrToScore(data.epsCagr3y);

  // 補助: PEG（20%）— スコアとして扱う。null=中立（50）
  let pegScore: number;
  if (data.peg === null) {
    pegScore = 50;
  } else if (data.peg < 0.5) {
    pegScore = 90;
  } else if (data.peg < 1.0) {
    pegScore = 70;
  } else if (data.peg > 2.0) {
    pegScore = 30;
  } else {
    pegScore = 50;
  }

  const raw = revenueScore * 0.4 + epsScore * 0.4 + pegScore * 0.2;
  return clamp(Math.round(raw), 0, 100);
}

/** 自己資本比率をベーススコア（0〜100）に変換。金融業の単独判定にも使用。 */
export function equityToScore(ratio: number): number {
  if (ratio >= 60) return 80;
  if (ratio >= 50) return 65;
  if (ratio >= 30) return 45;
  return 25;
}

export function calcSafety(
  data: Pick<AnalysisInput['fundamentals'], 'altmanZ' | 'equityRatio' | 'isFinancial'>,
): number {
  if (data.isFinancial || data.altmanZ === null) {
    // 金融業: 自己資本比率のみ（100%）
    return clamp(Math.round(equityToScore(data.equityRatio)), 0, 100);
  }

  // 主指標: Altman Z''（60%）
  const z = data.altmanZ;
  let altmanScore: number;
  if (z >= 3.0) altmanScore = 90;
  else if (z >= 2.6) altmanScore = 80;
  else if (z >= 1.8) altmanScore = 60;
  else if (z >= 1.1) altmanScore = 40;
  else altmanScore = 20;

  // 補助: 自己資本比率（40%）— equityToScore でベーススコア化してから加重
  const eqScore = equityToScore(data.equityRatio);

  const raw = altmanScore * 0.6 + eqScore * 0.4;
  return clamp(Math.round(raw), 0, 100);
}

export function calcTrend(data: AnalysisInput['technical']): number {
  // 主指標: SEPAステージ（50%）
  const sepaScoreMap: Record<string, number> = { S2: 85, S1: 60, S3: 40, S4: 20 };
  const sepaScore = sepaScoreMap[data.sepaStage] ?? 50;

  // 補助: ダウ理論（30%）— スコアとして扱う
  const dowScoreMap: Record<string, number> = { up: 80, range: 50, down: 20 };
  const dowScore = dowScoreMap[data.dowTrend] ?? 50;

  // 補助: グランビル（20%）— スコアとして扱う。null=中立（50）
  let granvilleScore = 50;
  if (data.granvilleSignal) {
    const gMap: Record<string, number> = {
      B1: 80, B2: 80, B3: 70, B4: 65,
      S1: 20, S2: 25, S3: 35, S4: 35,
    };
    granvilleScore = gMap[data.granvilleSignal] ?? 50;
  }

  const raw = sepaScore * 0.5 + dowScore * 0.3 + granvilleScore * 0.2;
  return clamp(Math.round(raw), 0, 100);
}

export function calcSupplyDemand(data: AnalysisInput['supplyDemand']): number {
  // 主指標: 信用倍率（50%）
  let marginScore: number;
  const r = data.marginBalanceRatio;
  if (r < 1) marginScore = 90;
  else if (r < 2) marginScore = 80;
  else if (r < 3) marginScore = 70;
  else if (r < 5) marginScore = 50;
  else if (r < 10) marginScore = 30;
  else marginScore = 15;

  // 補助: 出来高トレンド（25%）— スコアとして扱う
  let volScore: number;
  const vr = data.volumeRatio5d20d;
  if (vr >= 1.5) volScore = 80;
  else if (vr >= 1.2) volScore = 65;
  else if (vr < 0.8) volScore = 30;
  else volScore = 50;

  // 補助: モンテカルロ上昇確率（25%）— スコアとして扱う
  let mcScore: number;
  const mc = data.monteCarloUpProb;
  if (mc >= 0.7) mcScore = 80;
  else if (mc >= 0.6) mcScore = 65;
  else if (mc < 0.4) mcScore = 30;
  else mcScore = 50;

  const raw = marginScore * 0.5 + volScore * 0.25 + mcScore * 0.25;
  return clamp(Math.round(raw), 0, 100);
}

export function calcShareholderReturn(data: AnalysisInput['shareholderReturn']): number {
  // 無配銘柄: 自社株買いのみで評価
  if (data.isNoDividend) {
    if (data.buybackRecency === 'within1y') return 45;
    if (data.buybackRecency === 'within3y') return 30;
    return 15;
  }

  // 主指標: 配当利回り（25%）
  let yieldScore: number;
  const y = data.dividendYield;
  if (y >= 5) yieldScore = 90;
  else if (y >= 4) yieldScore = 80;
  else if (y >= 3) yieldScore = 70;
  else if (y >= 2) yieldScore = 55;
  else if (y >= 1) yieldScore = 40;
  else yieldScore = 0;

  // 主指標: 増配率トレンド（25%）
  let growthScore: number;
  const g = data.dividendGrowthRate3to5y;
  if (g >= 10) growthScore = 90;
  else if (g >= 5) growthScore = 70;
  else if (g >= 1) growthScore = 50;
  else if (g > 0) growthScore = 30; // 花王パターン
  else growthScore = 15; // 減配

  // 補助: 配当性向（15%）— スコアとして扱う
  let payoutScore: number;
  if (data.payoutRatio >= 30 && data.payoutRatio <= 50) payoutScore = 80;
  else if (data.payoutRatio > 80) payoutScore = 20;
  else payoutScore = 50;

  // 補助: DOE（10%）— スコアとして扱う
  let doeScore: number;
  if (data.doe >= 5) doeScore = 80;
  else if (data.doe >= 3) doeScore = 65;
  else doeScore = 40;

  // 補助: 自社株買い（15%）— スコアとして扱う
  let buybackScore: number;
  if (data.buybackRecency === 'within1y') buybackScore = 80;
  else if (data.buybackRecency === 'within3y') buybackScore = 65;
  else buybackScore = 30;

  // 補助: 総還元性向（10%）— スコアとして扱う
  let totalReturnScore: number;
  const tr = data.totalReturnRatio;
  if (tr >= 50 && tr <= 80) totalReturnScore = 75;
  else if (tr >= 30 && tr < 50) totalReturnScore = 60;
  else if (tr > 80) totalReturnScore = 40;
  else totalReturnScore = 40;

  const raw =
    yieldScore * 0.25 +
    growthScore * 0.25 +
    payoutScore * 0.15 +
    doeScore * 0.10 +
    buybackScore * 0.15 +
    totalReturnScore * 0.10;

  return clamp(Math.round(raw), 0, 100);
}

export function calculateAllScores(input: AnalysisInput): SevenAxisScores {
  return {
    valuation: calcValuation(input.fundamentals, input.industryAvg),
    profitability: calcProfitability(input.fundamentals, input.industryAvg),
    growth: calcGrowth(input.fundamentals),
    safety: calcSafety(input.fundamentals),
    trend: calcTrend(input.technical),
    supplyDemand: calcSupplyDemand(input.supplyDemand),
    shareholderReturn: calcShareholderReturn(input.shareholderReturn),
  };
}
