/**
 * get_stock_price tool — fetches OHLCV data for Japanese stocks via JQuants API.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { JQuantsClient } from './jquants-client.js';
import { CompanyResolver } from './resolver.js';

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

interface DailyQuote {
  Date: string;
  Code: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
  TurnoverValue?: number;
  AdjustmentOpen?: number;
  AdjustmentHigh?: number;
  AdjustmentLow?: number;
  AdjustmentClose?: number;
  AdjustmentVolume?: number;
}

interface DailyQuotesResponse {
  daily_quotes: DailyQuote[];
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
        .describe('4桁の銘柄コード（例: "7203"）'),
      from: z
        .string()
        .optional()
        .describe('取得開始日（YYYY-MM-DD）。省略時は60日前から'),
      to: z
        .string()
        .optional()
        .describe('取得終了日（YYYY-MM-DD）。省略時は今日まで'),
    }),
    func: async ({ code, from, to }) => {
      try {
        // Normalize to 5-digit code
        const code5 = CompanyResolver.isSecuritiesCode(code)
          ? CompanyResolver.normalize4To5Digit(code)
          : code;

        // Default date range: last 60 days
        const toDate = to ?? new Date().toISOString().slice(0, 10);
        const fromDate =
          from ??
          new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

        const response = await jquantsClient.get<DailyQuotesResponse>(
          'prices/daily_quotes',
          {
            code: code5,
            from: fromDate,
            to: toDate,
          },
        );

        const quotes = response.daily_quotes ?? [];
        if (quotes.length === 0) {
          return JSON.stringify({
            error: `銘柄コード ${code} の株価データが見つかりませんでした。`,
          });
        }

        return JSON.stringify({
          code,
          count: quotes.length,
          from: fromDate,
          to: toDate,
          quotes: quotes.map((q) => ({
            date: q.Date,
            open: q.AdjustmentOpen ?? q.Open,
            high: q.AdjustmentHigh ?? q.High,
            low: q.AdjustmentLow ?? q.Low,
            close: q.AdjustmentClose ?? q.Close,
            volume: q.AdjustmentVolume ?? q.Volume,
            turnover: q.TurnoverValue,
          })),
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: message });
      }
    },
  });
}
