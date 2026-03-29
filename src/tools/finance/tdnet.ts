/**
 * TDnet MCP tool — get_disclosures.
 *
 * Wraps the TDnet (適時開示情報閲覧サービス) MCP server for disclosure data.
 * When MCP is unavailable, returns a fallback message.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/** Whether the TDnet MCP server is currently available. */
export let tdnetAvailable = false;

/**
 * Detect whether the TDnet MCP server is accessible.
 * Stub implementation — actual MCP detection is platform-dependent.
 */
export async function detectTDnetMCP(): Promise<boolean> {
  // TODO: Implement actual MCP server detection
  tdnetAvailable = false;
  return false;
}

export const GET_DISCLOSURES_DESCRIPTION = `
TDnet（適時開示情報閲覧サービス）から企業の適時開示情報を取得します。

## When to Use
- 企業の最新IR情報（決算短信、業績修正等）を確認したいとき
- 適時開示の一覧を取得したいとき
- 決算発表日を確認したいとき

## When NOT to Use
- 有価証券報告書の詳細テキスト（→ read_filings）
- 株価データ（→ get_stock_price）
`;

/**
 * Create the get_disclosures tool.
 * Returns a fallback message when TDnet MCP is unavailable.
 */
export function createGetDisclosures(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_disclosures',
    description:
      'TDnet（適時開示情報閲覧サービス）から企業の適時開示情報を取得します。',
    schema: z.object({
      query: z
        .string()
        .describe(
          '銘柄コードまたは企業名（例: "7203" or "トヨタ自動車"）',
        ),
      days: z
        .number()
        .optional()
        .describe('取得する日数（デフォルト: 30日）'),
    }),
    func: async ({ query, days }) => {
      if (!tdnetAvailable) {
        return JSON.stringify({
          error:
            'TDnet MCPサーバーが利用できません。適時開示情報の取得にはMCPサーバーの起動が必要です。',
          suggestion:
            'TDnet MCPサーバーを起動するか、web_searchで適時開示を検索してください。',
          query,
          days: days ?? 30,
        });
      }

      // When MCP becomes available, this will delegate to the MCP tool
      return JSON.stringify({
        error: 'TDnet MCP integration not yet implemented.',
        query,
        days: days ?? 30,
      });
    },
  });
}
