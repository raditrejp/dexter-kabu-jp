/**
 * get_stock_price tool — fetches OHLCV data for Japanese stocks via JQuants API v2.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { JQuantsClient } from './jquants-client.js';

function isSecuritiesCode(input: string): boolean {
  return /^\d{4}$/.test(input);
}

function normalize4To5Digit(code4: string): string {
  return `${code4}0`;
}

export const GET_STOCK_PRICE_DESCRIPTION = `
日本株の株価データ（OHLCV）を取得します。4桁の銘柄コードと期間を指定してください。

## When to Use
- 個別銘柄の株価推移を確認したいとき
- 直近の終値・出来高を確認したいとき
- テクニカル分析の基礎データが必要なとき

## When NOT to Use
- 財務データやバリュエーション指標が必要なとき（→ get_financials, get_key_ratios）
- リアルタイム株価が必要なとき（15分遅延あり）
`;

/** JQuants API v2 daily bar record. */
interface DailyBar {
  Date: string;
  Code: string;
  O: number;    // Open
  H: number;    // High
  L: number;    // Low
  C: number;    // Close
  Vo: number;   // Volume
  Va?: number;  // Turnover Value
  AdjFactor?: number;
  AdjO?: number;
  AdjH?: number;
  AdjL?: number;
  AdjC?: number;
  AdjVo?: number;
}

interface DailyBarsResponse {
  data: DailyBar[];
}

/**
 * Create the get_stock_price tool.
 */
export function createGetStockPrice(
  jquantsClient: JQuantsClient,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_stock_price',
    description:
      '日本株の株価データ（OHLCV）を取得します。4桁の銘柄コードと期間を指定してください。',
    schema: z.object({
      code: z
        .string()
        .regex(/^\d{4,5}$/, '証券コードは4桁または5桁の数字')
        .describe('4桁の銘柄コード（例: "7203"）'),
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式')
        .optional()
        .describe('取得開始日（YYYY-MM-DD）。省略時は60日前から'),
      to: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式')
        .optional()
        .describe('取得終了日（YYYY-MM-DD）。省略時は今日まで'),
    }),
    func: async ({ code, from, to }) => {
      try {
        // Normalize to 5-digit code
        const code5 = isSecuritiesCode(code)
          ? normalize4To5Digit(code)
          : code;

        // Default date range: last 60 days
        const toDate = to ?? new Date().toISOString().slice(0, 10);
        const fromDate =
          from ??
          new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

        const response = await jquantsClient.get<DailyBarsResponse>(
          'equities/bars/daily',
          {
            code: code5,
            from: fromDate,
            to: toDate,
          },
        );

        const bars = response.data ?? [];
        if (bars.length === 0) {
          return JSON.stringify({
            error: `銘柄コード ${code} の株価データが見つかりませんでした。`,
          });
        }

        return JSON.stringify({
          code,
          count: bars.length,
          from: fromDate,
          to: toDate,
          quotes: bars.map((q) => ({
            date: q.Date,
            open: q.AdjO ?? q.O,
            high: q.AdjH ?? q.H,
            low: q.AdjL ?? q.L,
            close: q.AdjC ?? q.C,
            volume: q.AdjVo ?? q.Vo,
            turnover: q.Va,
          })),
        });
      } catch (error: unknown) {
        const { safeErrorMessage } = await import('../../utils/safe-error.js');
        return JSON.stringify({ error: safeErrorMessage(error) });
      }
    },
  });
}
