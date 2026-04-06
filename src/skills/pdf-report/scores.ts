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
    // 追加フィールド
    ebitda: number;
    ebitdaMargin: number;              // %
    interestBearingDebt: number;
    cashAndDeposits: number;
    netDebtToEbitda: number | null;    // null=EBITDA負
    debtToEquityRatio: number;
    operatingCFToDebt: number;         // %
    operatingIncomePerEmployee: number;
    capexRatio: number;                // %
    sgaRatio: number;                  // %
    fcfMargin: number;                 // %
    revenueCagr5y: number;             // 売上5年CAGR（%）
    // 10年分の時系列データ（Moat用）
    operatingMarginHistory: number[];  // 過去10年のoperatingMargin
    roeHistory: number[];              // 過去10年のROE
    fcfMarginHistory: number[];        // 過去10年のfcfMargin
    sgaRatioHistory: number[];         // 過去10年のsgaRatio
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

/** 8軸スコア（各0〜100） */
export interface EightAxisScores {
  valuation: number;
  profitability: number;
  growth: number;
  safety: number;
  trend: number;
  supplyDemand: number;
  shareholderReturn: number;
  moat: number;
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
  data: Pick<AnalysisInput['fundamentals'], 'dcfGapPercent' | 'per' | 'pbr' | 'ncavToMarketCap' | 'ebitda' | 'interestBearingDebt' | 'cashAndDeposits'>,
  marketCap?: number,
): number {
  // 主指標: DCF乖離率（50%）
  const dcfScore = lerp(data.dcfGapPercent, -30, 30, 10, 90);

  // 補助: EV/EBITDA（20%）— 絶対基準: 8倍以下→割安、15倍以上→割高
  let evEbitdaScore = 50;
  if (data.ebitda > 0 && marketCap) {
    const ev = marketCap + data.interestBearingDebt - data.cashAndDeposits;
    const evEbitda = ev / data.ebitda;
    evEbitdaScore = lerp(evEbitda, 15, 5, 10, 90); // 低い方が割安
  }

  // 補助: PER（15%）— 絶対基準: 8倍以下→割安、25倍以上→割高
  const perScore = lerp(data.per, 25, 8, 10, 90);

  // 補助: PBR（10%）
  let pbrScore = 50;
  if (data.pbr <= 0.5) pbrScore = 80;
  else if (data.pbr <= 1.0) pbrScore = 65;
  else if (data.pbr <= 2.0) pbrScore = 45;
  else pbrScore = 25;

  // 補助: ネットネット（5%）
  let nnScore = 50;
  const nn = data.ncavToMarketCap;
  if (nn > 1.5) nnScore = 100;
  else if (nn >= 1.0) nnScore = 85;
  else if (nn >= 0.67) nnScore = 65;

  const raw = dcfScore * 0.5 + evEbitdaScore * 0.2 + perScore * 0.15 + pbrScore * 0.1 + nnScore * 0.05;
  return clamp(Math.round(raw), 0, 100);
}

export function calcProfitability(
  data: Pick<AnalysisInput['fundamentals'], 'roe' | 'operatingMarginPercent' | 'roa' | 'ebitdaMargin' | 'operatingIncomePerEmployee'>,
): number {
  // 主指標: ROE（40%）
  let roeScore: number;
  if (data.roe >= 20) roeScore = 90;
  else if (data.roe >= 15) roeScore = 80;
  else if (data.roe >= 10) roeScore = 60;
  else if (data.roe >= 5) roeScore = 40;
  else roeScore = 20;

  // 補助: 営業利益率（20%）— 絶対基準: 15%以上→高収益、5%以下→低収益
  const marginScore = lerp(data.operatingMarginPercent, 3, 15, 10, 90);

  // 補助: EBITDAマージン（15%）
  let ebitdaScore: number;
  if (data.ebitdaMargin >= 20) ebitdaScore = 90;
  else if (data.ebitdaMargin >= 15) ebitdaScore = 70;
  else if (data.ebitdaMargin >= 10) ebitdaScore = 50;
  else if (data.ebitdaMargin >= 5) ebitdaScore = 30;
  else ebitdaScore = 15;

  // 補助: 従業員あたり営業利益（15%）— 絶対基準: 1500万以上→高効率、300万以下→低効率
  const empScore = lerp(data.operatingIncomePerEmployee, 3000000, 15000000, 10, 90);

  // 補助: ROA（10%）
  let roaScore = 50;
  if (data.roa >= 8) roaScore = 80;
  else if (data.roa >= 5) roaScore = 65;
  else if (data.roa >= 3) roaScore = 45;
  else roaScore = 25;

  const raw = roeScore * 0.4 + marginScore * 0.2 + ebitdaScore * 0.15 + empScore * 0.15 + roaScore * 0.1;
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
  data: Pick<AnalysisInput['fundamentals'], 'revenueCagr3y' | 'epsCagr3y' | 'peg' | 'capexRatio' | 'revenueCagr5y'>,
): number {
  const revenueScore = cagrToScore(data.revenueCagr3y);
  const epsScore = cagrToScore(data.epsCagr3y);

  let pegBonus = 0;
  if (data.peg !== null) {
    if (data.peg < 0.5) pegBonus = 10;
    else if (data.peg < 1.0) pegBonus = 5;
    else if (data.peg > 2.0) pegBonus = -5;
  }

  // 補助: 設備投資比率（15%）— 高い=成長投資中
  let capexScore: number;
  if (data.capexRatio >= 10) capexScore = 80;
  else if (data.capexRatio >= 5) capexScore = 65;
  else if (data.capexRatio >= 3) capexScore = 50;
  else capexScore = 35;

  // 補助: 売上5年CAGR（10%）
  const cagr5yScore = cagrToScore(data.revenueCagr5y);

  const raw = revenueScore * 0.3 + epsScore * 0.3 + (50 + pegBonus) * 0.15 + capexScore * 0.15 + cagr5yScore * 0.1;
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
  data: Pick<AnalysisInput['fundamentals'], 'altmanZ' | 'equityRatio' | 'isFinancial' | 'netDebtToEbitda' | 'debtToEquityRatio' | 'operatingCFToDebt'>,
): number {
  if (data.isFinancial || data.altmanZ === null) {
    return clamp(Math.round(equityToScore(data.equityRatio)), 0, 100);
  }

  // 主指標: Altman Z''（30%）
  let altmanScore: number;
  const z = data.altmanZ;
  if (z >= 3.0) altmanScore = 90;
  else if (z >= 2.6) altmanScore = 80;
  else if (z >= 1.8) altmanScore = 60;
  else if (z >= 1.1) altmanScore = 40;
  else altmanScore = 20;

  // 補助: Net Debt/EBITDA（25%）
  let ndScore = 50;
  if (data.netDebtToEbitda !== null) {
    if (data.netDebtToEbitda <= 0) ndScore = 90;       // ネットキャッシュ
    else if (data.netDebtToEbitda <= 2) ndScore = 70;
    else if (data.netDebtToEbitda <= 4) ndScore = 50;
    else ndScore = 20;
  }

  // 補助: 自己資本比率（15%）
  const eqScore = equityToScore(data.equityRatio);

  // 補助: D/Eレシオ（15%）
  let deScore: number;
  if (data.debtToEquityRatio < 0.5) deScore = 90;
  else if (data.debtToEquityRatio < 1.0) deScore = 70;
  else if (data.debtToEquityRatio < 2.0) deScore = 50;
  else deScore = 20;

  // 補助: 営業CF対有利子負債比率（15%）
  let cfDebtScore: number;
  if (data.operatingCFToDebt >= 50) cfDebtScore = 90;
  else if (data.operatingCFToDebt >= 30) cfDebtScore = 70;
  else if (data.operatingCFToDebt >= 20) cfDebtScore = 50;
  else cfDebtScore = 20;

  const raw = altmanScore * 0.3 + ndScore * 0.25 + eqScore * 0.15 + deScore * 0.15 + cfDebtScore * 0.15;
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

/** 標準偏差を計算 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calcMoat(
  data: Pick<AnalysisInput['fundamentals'], 'operatingMarginHistory' | 'roeHistory' | 'fcfMarginHistory' | 'operatingMarginPercent' | 'sgaRatioHistory'>,
): number {
  // 主指標: 営業利益率の安定性（35%）
  const omStd = stddev(data.operatingMarginHistory);
  let omStabilityScore: number;
  if (omStd < 2) omStabilityScore = 90;
  else if (omStd < 4) omStabilityScore = 70;
  else if (omStd < 6) omStabilityScore = 50;
  else if (omStd < 10) omStabilityScore = 30;
  else omStabilityScore = 15;

  // 補助: ROEの安定性（20%）
  const roeStd = stddev(data.roeHistory);
  let roeStabilityScore: number;
  if (roeStd < 3) roeStabilityScore = 90;
  else if (roeStd < 5) roeStabilityScore = 70;
  else if (roeStd < 8) roeStabilityScore = 50;
  else roeStabilityScore = 20;

  // 補助: FCFマージンの安定性（20%）
  const fcfStd = stddev(data.fcfMarginHistory);
  let fcfStabilityScore: number;
  if (fcfStd < 3) fcfStabilityScore = 90;
  else if (fcfStd < 5) fcfStabilityScore = 70;
  else if (fcfStd < 8) fcfStabilityScore = 50;
  else fcfStabilityScore = 20;

  // 補助: 営業利益率の水準（15%）
  let omLevelScore: number;
  if (data.operatingMarginPercent >= 15) omLevelScore = 90;
  else if (data.operatingMarginPercent >= 10) omLevelScore = 70;
  else if (data.operatingMarginPercent >= 5) omLevelScore = 50;
  else omLevelScore = 20;

  // 補助: SGA比率の安定性（10%）
  const sgaStd = stddev(data.sgaRatioHistory);
  let sgaStabilityScore: number;
  if (sgaStd < 2) sgaStabilityScore = 80;
  else if (sgaStd < 4) sgaStabilityScore = 60;
  else sgaStabilityScore = 30;

  const raw = omStabilityScore * 0.35 + roeStabilityScore * 0.2 + fcfStabilityScore * 0.2 + omLevelScore * 0.15 + sgaStabilityScore * 0.1;
  return clamp(Math.round(raw), 0, 100);
}

export function calculateAllScores(input: AnalysisInput): EightAxisScores {
  return {
    valuation: calcValuation(input.fundamentals),
    profitability: calcProfitability(input.fundamentals),
    growth: calcGrowth(input.fundamentals),
    safety: calcSafety(input.fundamentals),
    trend: calcTrend(input.technical),
    supplyDemand: calcSupplyDemand(input.supplyDemand),
    shareholderReturn: calcShareholderReturn(input.shareholderReturn),
    moat: calcMoat(input.fundamentals),
  };
}
