import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { EightAxisScores } from './scores.js';

export interface ReportInput {
  code: string;
  name: string;
  sector: string;
  market: string;
  price: number;
  marketCap: number;           // 億円
  analysisDate: string;
  scores: EightAxisScores;            // 現在株価ベースのスコア（メイン表示）
  scoresAtReport?: EightAxisScores;   // 決算時株価ベースのスコア（変動表示用）
  industryAvg: EightAxisScores;
  details: Record<keyof EightAxisScores, string>;
  summary: string;
  risks: Array<{ title: string; description: string }>;
  priceData?: Array<{
    date: string;
    close: number;
    volume: number;
    sma50?: number;
    sma200?: number;
  }>;
  hasJQuants?: boolean;        // デフォルトtrue。falseの場合はtrend/supplyDemand/株価チャートをグレーアウト
  hasSupplyDemandData?: boolean; // 需給データ（信用残）が取得済みかどうか
  keyMetrics?: {
    per?: number;
    pbr?: number;
    eps?: number;
    bps?: number;
    roe?: number;
    payoutRatio?: number;
    marginBalanceRatio?: number | null; // null=未取得
  };
}

export async function generateReport(input: ReportInput): Promise<string> {
  const templatePath = resolve(dirname(new URL(import.meta.url).pathname), 'templates', 'report.html');
  let html = readFileSync(templatePath, 'utf-8');

  // ReportInputのフラグで判定（process.envには依存しない）
  const hasTrend = input.hasJQuants !== false;
  const hasSupplyDemand = input.hasSupplyDemandData === true;
  const hasJQuants = hasTrend;
  const priceData = hasJQuants ? (input.priceData ?? []) : [];
  const hasSma200 = hasJQuants && priceData.some(d => d.sma200 !== undefined);

  // Replace all occurrences for placeholders that appear multiple times in the template
  html = html
    .replaceAll('{{companyName}}', escapeHtml(input.name))
    .replaceAll('{{code}}', escapeHtml(input.code))
    .replaceAll('{{sector}}', escapeHtml(input.sector))
    .replaceAll('{{market}}', escapeHtml(input.market))
    .replaceAll('{{price}}', input.price.toLocaleString())
    .replaceAll('{{marketCap}}', formatMarketCap(input.marketCap))
    .replaceAll('{{analysisDate}}', input.analysisDate)
    .replaceAll('{{scoresJson}}', JSON.stringify(input.scores))
    .replaceAll('{{scoresAtReportJson}}', JSON.stringify(input.scoresAtReport ?? null))
    .replaceAll('{{industryAvgJson}}', JSON.stringify(input.industryAvg))
    .replaceAll('{{summaryComment}}', escapeHtml(input.summary))
    .replaceAll('{{detailCards}}', buildDetailCards(input, hasTrend, hasSupplyDemand))
    .replaceAll('{{priceDataJson}}', JSON.stringify(priceData))
    .replaceAll('{{risksHtml}}', buildRisksHtml(input.risks))
    .replaceAll('{{keyMetricsHtml}}', buildKeyMetricsHtml(input.keyMetrics))
    .replaceAll('{{hasSma200}}', hasSma200 ? 'true' : 'false')
    .replaceAll('{{hasJQuants}}', hasJQuants ? 'true' : 'false')
    .replaceAll('{{hasTrend}}', hasTrend ? 'true' : 'false')
    .replaceAll('{{hasSupplyDemand}}', hasSupplyDemand ? 'true' : 'false');

  const outputDir = resolve(process.cwd(), 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, `${input.code}_report_${input.analysisDate}.pdf`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof (window as any).Chart !== 'undefined', { timeout: 15000 });
  // Wait for score cards and charts to render
  await page.waitForFunction(() => {
    const cards = document.getElementById('scoreCards');
    return cards && cards.children.length >= 8;
  }, { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  await browser.close();

  return outputPath;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarketCap(billionYen: number): string {
  if (billionYen >= 10000) return `${(billionYen / 10000).toFixed(1)}兆円`;
  return `${billionYen.toLocaleString()}億円`;
}

const AXIS_NAMES: Record<keyof EightAxisScores, string> = {
  valuation: '割安度',
  profitability: '稼ぐ力',
  growth: '成長性',
  safety: '安全性',
  trend: 'トレンド',
  supplyDemand: '需給',
  shareholderReturn: '還元力',
  moat: '事業独占力',
};

const DISABLED_MESSAGES: Partial<Record<keyof EightAxisScores, string>> = {
  trend: 'JQuants Lightプラン以上でテクニカル分析（SEPA・ダウ理論・グランビル）が表示されます。https://jpx-jquants.com/',
  supplyDemand: 'JQuants Standardプラン以上で需給分析（信用倍率・出来高・空売り比率）が表示されます。https://jpx-jquants.com/',
};

function buildDetailCards(input: ReportInput, hasTrend: boolean, hasSupplyDemand: boolean): string {
  return (Object.keys(AXIS_NAMES) as (keyof EightAxisScores)[])
    .map((key) => {
      const isDisabled = (key === 'trend' && !hasTrend) || (key === 'supplyDemand' && !hasSupplyDemand);
      const score = input.scores[key];
      const avg = input.industryAvg[key];
      const colorClass = score >= avg ? 'above' : 'below';
      const evidenceText = isDisabled ? DISABLED_MESSAGES[key]! : input.details[key];
      return `
        <div class="detail-card${isDisabled ? ' disabled' : ''}">
          <div class="detail-card-header">
            <span class="detail-axis-name">${AXIS_NAMES[key]}</span>
            <span class="detail-score-badge ${colorClass}">${score}</span>
          </div>
          <div class="detail-progress-bg">
            <div class="detail-progress-fill ${colorClass}" style="width: ${score}%"></div>
            <div class="detail-avg-marker" style="left: ${avg}%"></div>
          </div>
          <div class="detail-evidence">${escapeHtml(evidenceText)}</div>
        </div>`;
    })
    .join('\n');
}

function buildKeyMetricsHtml(metrics?: ReportInput['keyMetrics']): string {
  if (!metrics) return '';
  const items: Array<{ label: string; value: string }> = [
    { label: 'PER', value: metrics.per != null ? `${metrics.per}倍` : '—' },
    { label: 'PBR', value: metrics.pbr != null ? `${metrics.pbr.toFixed(2)}倍` : '—' },
    { label: 'EPS', value: metrics.eps != null ? `${metrics.eps.toFixed(1)}円` : '—' },
    { label: 'BPS', value: metrics.bps != null ? `${metrics.bps.toFixed(0)}円` : '—' },
    { label: 'ROE', value: metrics.roe != null ? `${metrics.roe.toFixed(1)}%` : '—' },
    { label: '配当性向', value: metrics.payoutRatio != null ? `${metrics.payoutRatio.toFixed(1)}%` : '—' },
    { label: '信用倍率', value: metrics.marginBalanceRatio != null ? `${metrics.marginBalanceRatio.toFixed(2)}倍` : '—' },
  ];
  return items.map(m =>
    `<div class="metric-card">
      <span class="metric-label">${m.label}</span>
      <span class="metric-value">${m.value}</span>
    </div>`
  ).join('\n');
}

function buildRisksHtml(risks: Array<{ title: string; description: string }>): string {
  return risks
    .map(r => `<li><strong>${escapeHtml(r.title)}:</strong> ${escapeHtml(r.description)}</li>`)
    .join('\n');
}
