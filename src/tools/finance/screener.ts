/**
 * company_screener tool — screen Japanese stocks via EDINET DB API.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { EdinetClient } from './edinet-client.js';

export const COMPANY_SCREENER_DESCRIPTION = `
日本株スクリーニング。自然言語で条件を指定。

## When to Use
- 特定条件に合う銘柄を探したいとき（例: 「ROE15%以上かつPBR1倍以下」）
- セクター別の銘柄リストが必要なとき
- バリュー株・グロース株のスクリーニング

## When NOT to Use
- 特定銘柄の詳細分析（→ get_financials, get_stock_price）
- テクニカル条件でのスクリーニング（→ get_technical_indicators）
`;

/**
 * Create the company_screener tool.
 */
export function createCompanyScreener(
  edinetClient: EdinetClient,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'company_screener',
    description:
      '日本株スクリーニング。自然言語で条件を指定。',
    schema: z.object({
      query: z
        .string()
        .describe(
          'スクリーニング条件（自然言語）。例: "ROE15%以上、PBR1倍以下、時価総額500億円以上"',
        ),
    }),
    func: async ({ query }) => {
      try {
        const data = await edinetClient.get<unknown>('screener', {
          query,
        });

        return JSON.stringify({ query, data });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: message });
      }
    },
  });
}
