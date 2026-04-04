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
  priceData: Array<{
    date: string;
    close: number;
    volume: number;
    sma50?: number;
    sma200?: number;
  }>;
}

export async function generateReport(input: ReportInput): Promise<string> {
  const templatePath = resolve(dirname(new URL(import.meta.url).pathname), 'templates', 'report.html');
  let html = readFileSync(templatePath, 'utf-8');

  const plan = process.env.JQUANTS_PLAN ?? 'free';
  const hasSma200 = plan !== 'free' && input.priceData.some(d => d.sma200 !== undefined);

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
    .replaceAll('{{detailCards}}', buildDetailCards(input))
    .replaceAll('{{priceDataJson}}', JSON.stringify(input.priceData))
    .replaceAll('{{risksHtml}}', buildRisksHtml(input.risks))
    .replaceAll('{{hasSma200}}', String(hasSma200));

  const outputDir = resolve(process.cwd(), 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, `${input.code}_report_${input.analysisDate}.pdf`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof (window as any).Chart !== 'undefined', { timeout: 15000 });
  // Wait for charts to render
  await page.waitForTimeout(1000);
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

function buildDetailCards(input: ReportInput): string {
  return (Object.keys(AXIS_NAMES) as (keyof EightAxisScores)[])
    .map((key) => {
      const score = input.scores[key];
      const avg = input.industryAvg[key];
      const colorClass = score >= avg ? 'above' : 'below';
      return `
        <div class="detail-card">
          <div class="detail-card-header">
            <span class="detail-axis-name">${AXIS_NAMES[key]}</span>
            <span class="detail-score-badge ${colorClass}">${score}</span>
          </div>
          <div class="detail-progress-bg">
            <div class="detail-progress-fill ${colorClass}" style="width: ${score}%"></div>
            <div class="detail-avg-marker" style="left: ${avg}%"></div>
          </div>
          <div class="detail-evidence">${escapeHtml(input.details[key])}</div>
        </div>`;
    })
    .join('\n');
}

function buildRisksHtml(risks: Array<{ title: string; description: string }>): string {
  return risks
    .map(r => `<li><strong>${escapeHtml(r.title)}:</strong> ${escapeHtml(r.description)}</li>`)
    .join('\n');
}
