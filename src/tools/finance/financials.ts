/**
 * get_financials tool — fetches financial data via EDINET DB API.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { EdinetClient } from './edinet-client.js';
import type { CompanyResolver } from './resolver.js';

export const GET_FINANCIALS_DESCRIPTION = `
日本企業の財務データ（売上、利益、ROE、PER等）を取得します。

## When to Use
- 決算データ（売上高、営業利益、純利益等）を確認したいとき
- 財務諸表の詳細（BS、PL、CF）が必要なとき
- 企業のファンダメンタル分析を行うとき

## When NOT to Use
- 株価データが必要なとき（→ get_stock_price）
- テクニカル指標が必要なとき（→ get_technical_indicators）
`;

/**
 * Create the get_financials tool.
 */
export function createGetFinancials(
  edinetClient: EdinetClient,
  resolver: CompanyResolver,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_financials',
    description:
      '日本企業の財務データ（売上、利益、ROE、PER等）を取得します。',
    schema: z.object({
      query: z
        .string()
        .describe(
          '銘柄コード（例: "7203"）または企業名（例: "トヨタ自動車"）',
        ),
      metric_type: z
        .enum(['summary', 'income', 'balance_sheet', 'cash_flow', 'ratios'])
        .optional()
        .describe(
          '取得する財務データの種類。省略時はsummary。',
        ),
    }),
    func: async ({ query, metric_type }) => {
      try {
        const company = await resolver.resolve(query);

        const params: Record<string, string> = {
          edinet_code: company.edinetCode,
        };
        if (metric_type) {
          params.metric_type = metric_type;
        }

        const data = await edinetClient.get<unknown>('financials', params);

        return JSON.stringify({
          company: {
            code: company.code,
            name: company.name,
            edinetCode: company.edinetCode,
            sector: company.sector33,
          },
          metric_type: metric_type ?? 'summary',
          data,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: message });
      }
    },
  });
}
