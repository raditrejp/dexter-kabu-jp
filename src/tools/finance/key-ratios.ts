/**
 * get_key_ratios tool — fetches financial ratios via EDINET DB API.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { EdinetClient } from './edinet-client.js';
import type { CompanyResolver } from './resolver.js';

export const GET_KEY_RATIOS_DESCRIPTION = `
日本企業の財務指標（PER、PBR、ROE、ROIC、配当利回り等）を取得。

## When to Use
- バリュエーション指標（PER、PBR等）を確認したいとき
- 収益性指標（ROE、ROIC等）を確認したいとき
- 配当利回りを確認したいとき

## When NOT to Use
- 株価の推移が必要なとき（→ get_stock_price）
- 詳細な財務諸表が必要なとき（→ get_financials）
`;

/**
 * Create the get_key_ratios tool.
 */
export function createGetKeyRatios(
  edinetClient: EdinetClient,
  resolver: CompanyResolver,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_key_ratios',
    description:
      '日本企業の財務指標（PER、PBR、ROE、ROIC、配当利回り等）を取得。',
    schema: z.object({
      query: z
        .string()
        .describe(
          '銘柄コード（例: "7203"）または企業名（例: "トヨタ自動車"）',
        ),
    }),
    func: async ({ query }) => {
      try {
        const company = await resolver.resolve(query);

        const data = await edinetClient.get<unknown>('key-ratios', {
          edinet_code: company.edinetCode,
        });

        return JSON.stringify({
          company: {
            code: company.code,
            name: company.name,
            edinetCode: company.edinetCode,
            sector: company.sector33,
          },
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
