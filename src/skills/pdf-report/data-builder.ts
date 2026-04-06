/**
 * data-builder.ts
 *
 * ラジ株ナビMCPから取得した annual.json の fiscalYears データを受け取り、
 * scores.ts の AnalysisInput を組み立てる。
 *
 * DCF乖離率・配当成長率（分割調整済み）・自社株買い検出・Altman Z'' の
 * 計算ロジックは edinet-charts.ts から忠実に移植。
 */

import type { AnalysisInput } from './scores.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FiscalYearData = Record<string, any>;

export interface AnnualData {
  fiscalYears: Record<string, FiscalYearData>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
}

const FINANCIAL_SECTORS = ['銀行業', '保険業', '証券、商品先物取引業', 'その他金融業'];

// ── 内部ヘルパー ──────────────────────────────────────────

/**
 * CAGR（複利年間成長率）を計算する。
 * 戻り値は % 単位（例: 5.0 = 5%）。
 */
function computeCagr(values: number[], years: number): number | null {
  if (values.length < years + 1) return null;
  const start = values[values.length - years - 1];
  const end = values[values.length - 1];
  if (start <= 0 || end <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/**
 * DCF乖離率を算出（WACC 6.5%, 永続成長率 1.0%, 予測期間5年）。
 * 戻り値: 正=割安, 負=割高（%）
 *
 * ベースFCF: 過去3-5年の平均FCF（直近値のブレを平滑化）
 * 成長率: 売上CAGR3年をベースに控えめに適用（FCF CAGRは振れが大きすぎる）
 *
 * @see edinet-charts.ts computeDcfGapPercent (135-192行目)
 */
function computeDcfGapPercent(
  sortedEntries: [string, FiscalYearData][],
  marketCap: number | null,
): number | null {
  if (marketCap == null || marketCap <= 0) return null;

  // FCF（営業CF - 設備投資）の時系列を取得
  const fcfValues: number[] = [];
  for (const [, fy] of sortedEntries) {
    const opCF = fy.cashFlowFromOperations;
    const capex = fy.capitalExpenditure;
    if (opCF != null && capex != null) {
      fcfValues.push(opCF - Math.abs(capex));
    }
  }
  if (fcfValues.length < 2) return null;

  // ベースFCF: 直近3-5年の平均（ブレを平滑化）
  const recentFCFs = fcfValues.slice(-Math.min(5, fcfValues.length));
  const avgFCF = recentFCFs.reduce((a, b) => a + b, 0) / recentFCFs.length;
  if (avgFCF <= 0) return null; // 平均FCF負の場合はDCF算出不可

  const wacc = 0.065;
  const terminalGrowth = 0.01;
  const forecastYears = 5;

  // 成長率: 売上CAGR3年をベースに使う（FCF CAGRは振れが大きい）
  let fcfGrowth = 0;
  const salesValues = sortedEntries
    .map(([, fy]) => fy.netSales as number | undefined)
    .filter((v): v is number => v != null && v > 0);
  if (salesValues.length >= 4) {
    const start = salesValues[salesValues.length - 4];
    const end = salesValues[salesValues.length - 1];
    if (start > 0 && end > 0) {
      fcfGrowth = Math.pow(end / start, 1 / 3) - 1;
      // 控えめに: 半分にして -5%〜+10% にクランプ
      fcfGrowth = Math.min(Math.max(fcfGrowth * 0.5, -0.05), 0.1);
    }
  }

  // 予測期間のFCF現在価値
  let pvFCF = 0;
  for (let t = 1; t <= forecastYears; t++) {
    const projectedFCF = avgFCF * Math.pow(1 + fcfGrowth, t);
    pvFCF += projectedFCF / Math.pow(1 + wacc, t);
  }

  // ターミナルバリュー
  const terminalFCF = avgFCF * Math.pow(1 + fcfGrowth, forecastYears) * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (wacc - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, forecastYears);

  const enterpriseValue = pvFCF + pvTerminal;

  // DCF乖離率 = (理論価値 / 時価総額 - 1) × 100
  return (enterpriseValue / marketCap - 1) * 100;
}

// ── メイン関数 ───────────────────────────────────────────

/**
 * ラジ株ナビMCPの annual.json データから AnalysisInput を構築する。
 *
 * DCF乖離率、配当成長率（分割調整済み）、自社株買い検出、Altman Z'' を自動計算。
 * technical / supplyDemand はデフォルト値を設定し、呼び出し元で上書きすること。
 *
 * @param annualData      ラジ株ナビMCP get_edinet_financial_data の戻り値
 * @param currentPrice    現在株価（円）
 * @param sector          業種名（金融業判定に使用）
 * @param useCurrentPrice trueの場合、PER/PBR/配当利回り/marketCapを現在株価ベースで計算（デフォルトfalse=決算時株価ベース）
 */
export function buildAnalysisInput(
  annualData: AnnualData,
  currentPrice: number,
  sector: string,
  useCurrentPrice: boolean = false,
): AnalysisInput {
  const fy = annualData.fiscalYears;
  const sortedEntries: [string, FiscalYearData][] = Object.entries(fy).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (sortedEntries.length === 0) {
    throw new Error('fiscalYears が空です');
  }

  const latest = sortedEntries[sortedEntries.length - 1][1];
  const isFinancial = FINANCIAL_SECTORS.includes(sector);

  // ── 株式情報 ────────────────────────────────────────────
  const sharesOutstanding: number | null = latest.sharesOutstanding ?? null;
  const treasuryShares: number = latest.treasuryShares ?? 0;
  const effectiveShares = sharesOutstanding != null ? sharesOutstanding - treasuryShares : null;
  const bps: number | null = latest.bps ?? null;

  // 決算時株価（PER × EPS）— ラジ株ナビと同じ方式
  const eps: number | null = latest.eps ?? null;
  const perFromData: number | null = latest.priceEarningsRatio ?? null;
  const stockPriceAtReport = (perFromData != null && eps != null && perFromData > 0 && eps > 0)
    ? perFromData * eps : null;

  // useCurrentPrice: 現在株価 or 決算時株価を使い分け
  const priceForCalc = useCurrentPrice ? currentPrice : (stockPriceAtReport ?? currentPrice);

  // 時価総額（スコア計算用）
  const marketCapForScore =
    effectiveShares != null && effectiveShares > 0 ? priceForCalc * effectiveShares : null;

  // 時価総額（DCF用）: 常に決算時株価ベース（DCFの理論価値との比較なので）
  const marketCapForDcf =
    stockPriceAtReport != null && effectiveShares != null && effectiveShares > 0
      ? stockPriceAtReport * effectiveShares : null;

  // PBR
  const pbr = bps != null && bps > 0 ? priceForCalc / bps : 0;

  // ── バリュエーション ────────────────────────────────────
  // PER
  const per = useCurrentPrice
    ? (eps != null && eps > 0 ? currentPrice / eps : 0)
    : (perFromData ?? (eps != null && eps > 0 ? currentPrice / eps : 0));

  // NCAV = 流動資産 - 負債合計
  const currentAssets: number | null = latest.currentAssets ?? null;
  const totalLiabilities: number | null = latest.totalLiabilities ?? null;
  const ncav =
    currentAssets != null && totalLiabilities != null ? currentAssets - totalLiabilities : null;
  const ncavToMarketCap =
    ncav != null && marketCapForScore != null && marketCapForScore > 0 ? ncav / marketCapForScore : 0;

  const ebitda =
    latest.operatingIncome != null && latest.depreciationAndAmortization != null
      ? latest.operatingIncome + latest.depreciationAndAmortization
      : (latest.ebitda ?? 0);
  const interestBearingDebt: number = latest.interestBearingDebt ?? 0;
  const cashAndDeposits: number = latest.cashAndDeposits ?? latest.cashAndEquivalents ?? 0;

  // DCF乖離率
  const dcfGapPercent = computeDcfGapPercent(sortedEntries, useCurrentPrice ? marketCapForScore : marketCapForDcf) ?? 0;

  // ── 収益性 ──────────────────────────────────────────────
  const roe: number = latest.roe ?? 0;
  const operatingMarginPercent: number = latest.operatingMargin ?? 0;
  const roa: number = latest.roa ?? 0;
  const netSalesLatest: number = latest.netSales ?? 0;
  const ebitdaMargin =
    ebitda > 0 && netSalesLatest > 0 ? (ebitda / netSalesLatest) * 100 : 0;
  const operatingIncomePerEmployee =
    latest.operatingIncome != null && latest.numberOfEmployees > 0
      ? latest.operatingIncome / latest.numberOfEmployees
      : 0;

  // ── 成長性 ──────────────────────────────────────────────
  const salesValues = sortedEntries
    .map(([, fy]) => fy.netSales as number | undefined)
    .filter((v): v is number => v != null && v > 0);
  const epsValues = sortedEntries
    .map(([, fy]) => fy.eps as number | undefined)
    .filter((v): v is number => v != null && v > 0);

  const revenueCagr3y = computeCagr(salesValues, 3) ?? 0;
  const revenueCagr5y = computeCagr(salesValues, 5) ?? 0;
  const epsCagr3y = computeCagr(epsValues, 3) ?? 0;
  const peg = per > 0 && epsCagr3y > 0 ? per / epsCagr3y : null;
  const capexRatio =
    latest.capitalExpenditure != null && netSalesLatest > 0
      ? (Math.abs(latest.capitalExpenditure) / netSalesLatest) * 100
      : 0;

  // ── 安全性 ──────────────────────────────────────────────
  const equityRatio: number = latest.equityRatio ?? 0;
  const equity: number | null = latest.equity ?? null;

  // Altman Z''（非金融向け, 新興国修正版: 3.25 + 6.56X1 + 3.26X2 + 6.72X3 + 1.05X4）
  // currentLiabilities が取れない場合は算出しない（フォールバックすると歪む）
  let altmanZ: number | null = null;
  if (!isFinancial && latest.totalAssets > 0) {
    const ca = latest.currentAssets;
    const cl = latest.currentLiabilities;
    const re = latest.retainedEarnings;
    const ebit = latest.operatingIncome;
    const eq = latest.equity;
    const tl = latest.totalLiabilities;
    if (
      ca != null &&
      cl != null &&
      re != null &&
      ebit != null &&
      eq != null &&
      tl != null &&
      tl > 0
    ) {
      const ta = latest.totalAssets;
      const x1 = (ca - cl) / ta;
      const x2 = re / ta;
      const x3 = ebit / ta;
      const x4 = eq / tl;
      altmanZ = 3.25 + 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
    }
  }

  const netDebtToEbitda =
    interestBearingDebt != null && cashAndDeposits != null && ebitda > 0
      ? (interestBearingDebt - cashAndDeposits) / ebitda
      : null;
  const debtToEquityRatio =
    interestBearingDebt != null && equity != null && equity > 0
      ? interestBearingDebt / equity
      : 0;
  const operatingCFToDebt =
    latest.cashFlowFromOperations != null &&
    interestBearingDebt != null &&
    interestBearingDebt > 0
      ? (latest.cashFlowFromOperations / interestBearingDebt) * 100
      : 0;

  // ── 株主還元 ────────────────────────────────────────────

  // 配当利回り
  const dividendYield =
    latest.dividendPerShare != null && priceForCalc > 0
      ? (latest.dividendPerShare / priceForCalc) * 100
      : 0;

  // 配当成長率（分割調整済み）
  // @see edinet-charts.ts 274-294行目
  const sharesHistory = sortedEntries
    .map(([, fy]) => fy.sharesOutstanding as number | undefined)
    .filter((v): v is number => v != null && v > 0);
  const latestShares = sharesHistory.length > 0 ? sharesHistory[sharesHistory.length - 1] : null;
  const adjustedDivValues: number[] = [];
  for (const [, fy] of sortedEntries) {
    const dps = fy.dividendPerShare;
    const shares = fy.sharesOutstanding;
    if (dps == null || dps <= 0) continue;
    if (shares != null && latestShares != null && shares > 0) {
      // 分割調整: 当時のDPSを最新株数基準に変換
      const adjustmentRatio = shares / latestShares;
      adjustedDivValues.push(dps * adjustmentRatio);
    } else {
      adjustedDivValues.push(dps);
    }
  }
  const dividendGrowthRate3to5y =
    (computeCagr(adjustedDivValues, Math.min(5, adjustedDivValues.length - 1)) ??
      computeCagr(adjustedDivValues, 3)) ??
    0;

  const payoutRatio: number = latest.payoutRatio ?? 0;

  // DOE = 配当総額 / 株主資本 × 100
  // @see edinet-charts.ts 297-300行目
  const dividendTotal =
    latest.dividendPerShare != null && effectiveShares != null
      ? latest.dividendPerShare * effectiveShares
      : null;
  const doe =
    dividendTotal != null && equity != null && equity > 0
      ? (dividendTotal / equity) * 100
      : 0;

  // 自社株買い検出
  // @see edinet-charts.ts 301-328行目
  let buybackRecency: 'within1y' | 'within3y' | 'none' = 'none';
  let hasBuyback = false;
  const recent5 = sortedEntries.slice(-5);

  if (recent5.some(([, fy]) => (fy.purchaseOfTreasuryShares ?? 0) !== 0)) {
    // purchaseOfTreasuryShares がある場合はそちらを優先
    hasBuyback = true;
    const latestBuyback = latest.purchaseOfTreasuryShares;
    if (latestBuyback != null && latestBuyback !== 0) {
      buybackRecency = 'within1y';
    } else {
      const recent3 = sortedEntries.slice(-3);
      if (recent3.some(([, fy]) => (fy.purchaseOfTreasuryShares ?? 0) !== 0)) {
        buybackRecency = 'within3y';
      }
    }
  } else {
    // フォールバック: 発行済株式数の減少で自社株買いを推定
    for (
      let i = sortedEntries.length - 1;
      i >= 1 && i >= sortedEntries.length - 3;
      i--
    ) {
      const currShares = sortedEntries[i][1].sharesOutstanding;
      const prevShares = sortedEntries[i - 1][1].sharesOutstanding;
      if (currShares != null && prevShares != null && currShares < prevShares * 0.99) {
        hasBuyback = true;
        if (i === sortedEntries.length - 1) buybackRecency = 'within1y';
        else if (buybackRecency === 'none') buybackRecency = 'within3y';
      }
    }
  }

  // 総還元性向
  // @see edinet-charts.ts 330-336行目
  const totalReturnRatio = (() => {
    if (latest.totalReturnRatio != null) return latest.totalReturnRatio;
    const ni = latest.netIncome;
    if (dividendTotal == null || !ni || ni <= 0) return 0;
    const bb = Math.abs(latest.purchaseOfTreasuryShares ?? 0);
    return ((dividendTotal + bb) / ni) * 100;
  })();

  const isNoDividend = latest.dividendPerShare == null || latest.dividendPerShare === 0;

  // ── 事業独占力（Moat）時系列 ───────────────────────────
  const operatingMarginHistory = sortedEntries
    .map(([, fy]) => fy.operatingMargin as number | undefined)
    .filter((v): v is number => v != null);

  const roeHistory = sortedEntries
    .map(([, fy]) => fy.roe as number | undefined)
    .filter((v): v is number => v != null);

  const fcfMarginHistory = sortedEntries
    .map(([, fy]) => {
      const fcf = fy.fcf;
      const sales = fy.netSales;
      if (fcf == null || !sales) return undefined;
      return (fcf / sales) * 100;
    })
    .filter((v): v is number => v != null);

  const sgaRatioHistory = sortedEntries
    .map(([, fy]) => {
      const sga = fy.sellingGeneralAndAdministrative;
      const sales = fy.netSales;
      if (sga == null || !sales) return undefined;
      return (sga / sales) * 100;
    })
    .filter((v): v is number => v != null);

  // 最新のfcfMargin / sgaRatio（スコア計算用の単年値）
  const fcfLatest = latest.fcf;
  const fcfMargin =
    fcfLatest != null && netSalesLatest > 0 ? (fcfLatest / netSalesLatest) * 100 : 0;
  const sgaLatest = latest.sellingGeneralAndAdministrative;
  const sgaRatio =
    sgaLatest != null && netSalesLatest > 0 ? (sgaLatest / netSalesLatest) * 100 : 0;

  // ── AnalysisInput 組み立て ───────────────────────────────
  return {
    fundamentals: {
      dcfGapPercent,
      per,
      pbr,
      ncavToMarketCap,
      roe,
      operatingMarginPercent,
      roa,
      revenueCagr3y,
      epsCagr3y,
      peg,
      equityRatio,
      altmanZ,
      isFinancial,
      ebitda,
      ebitdaMargin,
      interestBearingDebt,
      cashAndDeposits,
      netDebtToEbitda,
      debtToEquityRatio,
      operatingCFToDebt,
      operatingIncomePerEmployee,
      capexRatio,
      sgaRatio,
      fcfMargin,
      revenueCagr5y,
      marketCap: (useCurrentPrice ? marketCapForScore : marketCapForDcf) ?? undefined,
      operatingMarginHistory,
      roeHistory,
      fcfMarginHistory,
      sgaRatioHistory,
    },
    // technical はデフォルト値（analyzeTechnical で上書きする前提）
    technical: {
      sepaStage: 'S1',
      dowTrend: 'range',
      granvilleSignal: null,
    },
    // supplyDemand はデフォルト値（analyzeSupplyDemand で上書きする前提）
    supplyDemand: {
      marginBalanceRatio: 3,
      volumeRatio5d20d: 1,
      monteCarloUpProb: 0.5,
    },
    shareholderReturn: {
      dividendYield,
      dividendGrowthRate3to5y,
      payoutRatio,
      doe,
      hasBuyback,
      buybackRecency,
      totalReturnRatio,
      isNoDividend,
    },
  };
}
