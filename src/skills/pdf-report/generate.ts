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
  scores: EightAxisScores;
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
}

export async function generateReport(input: ReportInput): Promise<string> {
  const templatePath = resolve(dirname(new URL(import.meta.url).pathname), 'templates', 'report.html');
  let html = readFileSync(templatePath, 'utf-8');

  const plan = process.env.JQUANTS_PLAN ?? 'free';
  // Light以上でないとリアルタイム株価データが取得できない（Freeは12週遅れ）
  const hasJQuants = input.hasJQuants !== false && plan !== 'free';
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
    .replaceAll('{{industryAvgJson}}', JSON.stringify(input.industryAvg))
    .replaceAll('{{summaryComment}}', escapeHtml(input.summary))
    .replaceAll('{{detailCards}}', buildDetailCards(input, hasJQuants))
    .replaceAll('{{priceDataJson}}', JSON.stringify(priceData))
    .replaceAll('{{risksHtml}}', buildRisksHtml(input.risks))
    .replaceAll('{{hasSma200}}', String(hasSma200))
    .replaceAll('{{hasJQuants}}', String(hasJQuants));

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

const NO_JQUANTS_AXES: (keyof EightAxisScores)[] = ['trend', 'supplyDemand'];
const NO_JQUANTS_MESSAGE = 'JQuants APIを無料登録すると、テクニカル分析（SEPA・ダウ理論・グランビル）と需給分析（信用倍率・出来高）が表示されます。https://jpx-jquants.com/';

function buildDetailCards(input: ReportInput, hasJQuants: boolean): string {
  return (Object.keys(AXIS_NAMES) as (keyof EightAxisScores)[])
    .map((key) => {
      const isDisabled = !hasJQuants && NO_JQUANTS_AXES.includes(key);
      const score = input.scores[key];
      const avg = input.industryAvg[key];
      const colorClass = score >= avg ? 'above' : 'below';
      const evidenceText = isDisabled ? NO_JQUANTS_MESSAGE : input.details[key];
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

function buildRisksHtml(risks: Array<{ title: string; description: string }>): string {
  return risks
    .map(r => `<li><strong>${escapeHtml(r.title)}:</strong> ${escapeHtml(r.description)}</li>`)
    .join('\n');
}
