#!/usr/bin/env bun
/**
 * PDF Report CLI
 *
 * Usage: bun run src/skills/pdf-report/cli.ts <銘柄コード> [--comments-json <path>]
 *
 * Step 0-5（データ取得→スコア算出）を実行し、結果をJSONで出力する。
 * --comments-json が指定された場合、コメントを読み込んでPDFを生成する。
 *
 * 2段階で使う:
 *   1) bun run src/skills/pdf-report/cli.ts 1414
 *      → output/1414_data.json にスコア・データを出力
 *   2) Claude Codeがコメントを生成して output/1414_comments.json に保存
 *   3) bun run src/skills/pdf-report/cli.ts 1414 --comments-json output/1414_comments.json
 *      → output/YYYY-MM-DD_1414_report.pdf を生成
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { buildAnalysisInput, type AnnualData } from './data-builder.js';
import { calculateAllScores, type EightAxisScores } from './scores.js';
import { analyzeTechnical, calcSMA, type OHLCVBar } from './technical.js';
import { fetchSupplyDemandData } from './supply-demand.js';
import { generateReport, type ReportInput } from './generate.js';
import { JQuantsClient } from '../../tools/finance/jquants-client.js';
import type { JQuantsPlan } from '../../config/index.js';

// ── ラジ株ナビMCP直接呼び出し ──────────────────────────────
async function callRadikabunavi(apiKey: string, toolName: string, toolArgs: Record<string, unknown>): Promise<string> {
  const endpoint = 'https://radikabunavi.com/mcp';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${apiKey}`,
  };

  // initialize
  const initResp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'kabu-dexter-cli', version: '1.0.0' } }, id: 0 }),
  });
  const sid = initResp.headers.get('mcp-session-id');
  if (sid) headers['mcp-session-id'] = sid;

  // notifications/initialized
  await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) });

  // tools/call
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: toolName, arguments: toolArgs }, id: 1 }),
  });
  const text = await resp.text();
  const dataLines = [...text.matchAll(/^data:\s*(.+)$/gm)];
  const jsonStr = dataLines.length > 0 ? dataLines[dataLines.length - 1][1] : text.match(/^(\{.+\})$/m)?.[1] ?? text;
  const parsed = JSON.parse(jsonStr);
  if (parsed.error) throw new Error(`MCP error: ${parsed.error.message}`);
  const contents = parsed.result?.content ?? [];
  return contents.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n');
}

// ── .env読み込み ──────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

// ── 引数パース ──────────────────────────────────────────
const args = process.argv.slice(2);
const code4 = args[0]?.replace(/\D/g, '');
if (!code4 || code4.length < 4) {
  console.error('Usage: bun run src/skills/pdf-report/cli.ts <銘柄コード> [--comments-json <path>]');
  process.exit(1);
}

const code5 = code4.length === 4 ? `${code4}0` : code4;
const commentsIdx = args.indexOf('--comments-json');
const commentsPath = commentsIdx !== -1 ? args[commentsIdx + 1] : null;

const plan = (process.env.JQUANTS_PLAN ?? 'free') as JQuantsPlan;
const planLevel = { free: 0, light: 1, standard: 2, premium: 3 }[plan] ?? 0;
const today = new Date().toISOString().slice(0, 10);

const outputDir = resolve(process.cwd(), 'output');
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

// ── Phase 2: コメント付きPDF生成 ──────────────────────────
if (commentsPath) {
  const dataPath = resolve(outputDir, `${code4}_data.json`);
  if (!existsSync(dataPath)) {
    console.error(`データファイルが見つかりません: ${dataPath}`);
    console.error('先に bun run src/skills/pdf-report/cli.ts ' + code4 + ' を実行してください');
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const comments = JSON.parse(readFileSync(resolve(commentsPath), 'utf-8'));

  const reportInput: ReportInput = {
    code: code4,
    name: data.name,
    sector: data.sector,
    market: data.market,
    price: data.currentPrice,
    marketCap: data.marketCapOku,
    analysisDate: today,
    scores: data.scoresCurrent ?? data.scoresAtReport,
    scoresAtReport: data.scoresAtReport,
    industryAvg: { valuation: 50, profitability: 50, growth: 50, safety: 50, trend: 50, supplyDemand: 50, shareholderReturn: 50, moat: 50 },
    details: comments.details,
    summary: comments.summary,
    risks: comments.risks,
    priceData: data.priceData ?? [],
    hasJQuants: planLevel >= 1,
    hasSupplyDemandData: data.hasSupplyDemandData ?? false,
    keyMetrics: data.keyMetrics,
  };

  const outputPath = await generateReport(reportInput);
  console.log(JSON.stringify({ pdfPath: outputPath }));
  process.exit(0);
}

// ── Phase 1: データ取得→スコア算出 ──────────────────────────
console.error('=== PDF Report CLI: データ取得開始 ===');
console.error(`銘柄: ${code4} (${code5}), プラン: ${plan}`);

// Step 1: ラジ株ナビMCPで財務データ取得
console.error('Step 1: 財務データ取得中...');
const radikabuKey = process.env.RADIKABUNAVI_API_KEY;
if (!radikabuKey) {
  console.error('RADIKABUNAVI_API_KEY が設定されていません');
  process.exit(1);
}

const financialRaw = await callRadikabunavi(radikabuKey, 'get_edinet_financial_data', { code: code4 });
const annualData: AnnualData = JSON.parse(financialRaw);

// companyNameはトップレベルから取得
const companyName = ((annualData as Record<string, unknown>).companyName as string) ?? code4;

// sector/marketはlist_edinet_stocksから取得（軽量API）
let sector = '';
let market = '';
try {
  const listRaw = await callRadikabunavi(radikabuKey, 'list_edinet_stocks', {});
  const listData = JSON.parse(listRaw);
  const stocks = listData.stocks ?? listData;
  if (Array.isArray(stocks)) {
    const match = stocks.find((s: Record<string, unknown>) => String(s.code) === code4);
    if (match) {
      sector = (match.sector ?? match.industry ?? '') as string;
      market = (match.market ?? '') as string;
    }
  }
} catch {
  // sector/marketなしでも続行
}
const isFinancial = ['銀行業', '保険業', '証券、商品先物取引業', 'その他金融業'].includes(sector);

console.error(`  → ${companyName} (${sector} / ${market})`);

// Step 2: 株価データ取得 (Light以上)
let bars: OHLCVBar[] = [];
let currentPrice = 0;
let priceData: Array<{ date: string; close: number; volume: number; sma50?: number; sma200?: number }> = [];

if (planLevel >= 1 && process.env.JQUANTS_API_KEY) {
  console.error('Step 2: 株価データ取得中...');
  const jquants = new JQuantsClient(plan);
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7 * Math.min(getPlanWeeks(), 300));
  const fromStr = fromDate.toISOString().slice(0, 10);

  const resp = await jquants.get<{ data: Array<Record<string, unknown>> }>(
    'equities/bars/daily',
    { code: code5, from: fromStr, to: today },
  );

  bars = (resp.data ?? []).map((d) => ({
    date: d.Date as string,
    open: d.AdjO as number,
    high: d.AdjH as number,
    low: d.AdjL as number,
    close: d.AdjC as number,
    volume: d.AdjVo as number,
  }));

  if (bars.length > 0) {
    currentPrice = bars[bars.length - 1].close;
    const closes = bars.map((b) => b.close);
    const sma50Arr = calcSMA(closes, 50);
    const sma200Arr = calcSMA(closes, 200);
    priceData = bars.map((b, i) => ({
      date: b.date,
      close: b.close,
      volume: b.volume,
      ...(sma50Arr[i] != null ? { sma50: sma50Arr[i] as number } : {}),
      ...(sma200Arr[i] != null ? { sma200: sma200Arr[i] as number } : {}),
    }));
  }
  console.error(`  → ${bars.length}日分取得, 現在株価: ${currentPrice}`);
} else {
  // Freeプラン: サマリーから株価取得
  currentPrice = summary.stockPrice ?? summary.price ?? 0;
  console.error(`Step 2: スキップ（Freeプラン）, 決算時株価: ${currentPrice}`);
}

// Step 3: 信用残取得 (Standard以上)
let marginBalanceRatio: number | null = null;
let hasSupplyDemandData = false;

if (planLevel >= 2) {
  console.error('Step 3: 信用残取得中...');
  const sdData = await fetchSupplyDemandData(code4, plan);
  if (sdData) {
    marginBalanceRatio = sdData.marginBalanceRatio;
    hasSupplyDemandData = true;
    console.error(`  → 信用倍率: ${marginBalanceRatio}`);
  } else {
    console.error('  → データなし');
  }
} else {
  console.error('Step 3: スキップ（Standard未満）');
}

// Step 4: AnalysisInput構築
console.error('Step 4: スコア計算中...');
const analysisInputAtReport = buildAnalysisInput(annualData, currentPrice, sector, false);
const analysisInputCurrent = planLevel >= 1
  ? buildAnalysisInput(annualData, currentPrice, sector, true)
  : null;

// テクニカルデータ上書き
let technicalResult = null;
if (bars.length >= 50) {
  technicalResult = analyzeTechnical(bars);
  analysisInputAtReport.technical = {
    sepaStage: technicalResult.sepaStage,
    dowTrend: technicalResult.dowTrend,
    granvilleSignal: technicalResult.granvilleSignal,
  };
  if (analysisInputCurrent) {
    analysisInputCurrent.technical = { ...analysisInputAtReport.technical };
  }
}

// 需給データ上書き
if (hasSupplyDemandData && marginBalanceRatio !== null) {
  analysisInputAtReport.supplyDemand.marginBalanceRatio = marginBalanceRatio;
  if (technicalResult) {
    analysisInputAtReport.supplyDemand.volumeRatio5d20d = technicalResult.volumeRatio5d20d;
  }
  if (analysisInputCurrent) {
    analysisInputCurrent.supplyDemand = { ...analysisInputAtReport.supplyDemand };
  }
}

// Step 5: 8軸スコア算出
const scoresAtReport = calculateAllScores(analysisInputAtReport);
const scoresCurrent = analysisInputCurrent ? calculateAllScores(analysisInputCurrent) : null;

console.error('  → スコア算出完了');
console.error(`    割安度:${scoresAtReport.valuation} 稼ぐ力:${scoresAtReport.profitability} 成長性:${scoresAtReport.growth} 安全性:${scoresAtReport.safety}`);
console.error(`    トレンド:${scoresAtReport.trend} 需給:${scoresAtReport.supplyDemand} 還元力:${scoresAtReport.shareholderReturn} 事業独占力:${scoresAtReport.moat}`);

// 主要指標
const latestFy = Object.entries(annualData.fiscalYears).sort(([a], [b]) => a.localeCompare(b)).pop();
const f = latestFy ? latestFy[1] : {} as Record<string, unknown>;

const keyMetrics = {
  per: (f.priceEarningsRatio as number) ?? undefined,
  pbr: f.bps ? currentPrice / (f.bps as number) : undefined,
  eps: (f.eps as number) ?? undefined,
  bps: (f.bps as number) ?? undefined,
  roe: (f.roe as number) ?? undefined,
  payoutRatio: (f.payoutRatio as number) ?? undefined,
  marginBalanceRatio,
};

// 時価総額（億円）
const sharesOutstanding = (f.sharesOutstanding as number) ?? 0;
const treasuryShares = (f.treasuryShares as number) ?? 0;
const effectiveShares = sharesOutstanding - treasuryShares;
const marketCapOku = effectiveShares > 0 ? Math.round(currentPrice * effectiveShares / 100000000) : 0;

// データJSON出力
const outputData = {
  code: code4,
  name: companyName,
  sector,
  market,
  currentPrice,
  marketCapOku,
  scoresAtReport,
  scoresCurrent,
  priceData,
  hasSupplyDemandData,
  keyMetrics,
  technicalResult: technicalResult ? {
    sepaStage: technicalResult.sepaStage,
    sepaScore: technicalResult.sepaScore,
    dowTrend: technicalResult.dowTrend,
    granvilleSignal: technicalResult.granvilleSignal,
    volumeRatio5d20d: technicalResult.volumeRatio5d20d,
  } : null,
  analysisInput: {
    fundamentals: analysisInputAtReport.fundamentals,
    shareholderReturn: analysisInputAtReport.shareholderReturn,
    supplyDemand: analysisInputAtReport.supplyDemand,
  },
  isFinancial,
};

const dataPath = resolve(outputDir, `${code4}_data.json`);
writeFileSync(dataPath, JSON.stringify(outputData, null, 2));
console.error(`\nデータ出力: ${dataPath}`);

// stdout にもJSON出力（Claude Codeが読み取れるように）
console.log(JSON.stringify(outputData));

// ── helpers ──
function getPlanWeeks(): number {
  return { free: 12, light: 260, standard: 520, premium: 1040 }[plan] ?? 12;
}
