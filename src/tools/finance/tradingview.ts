/**
 * TradingView MCP tool — get_technical_indicators.
 *
 * Wraps the TradingView MCP server for technical indicator data.
 * When MCP is unavailable, returns a fallback message.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

/** Whether the TradingView MCP server is currently available. */
export let tradingviewAvailable = false;

/**
 * Detect whether the TradingView MCP server is accessible.
 * Stub implementation — actual MCP detection is platform-dependent.
 */
export async function detectTradingViewMCP(): Promise<boolean> {
  // TODO: Implement actual MCP server detection (e.g., check stdio/SSE connection)
  tradingviewAvailable = false;
  return false;
}

export const GET_TECHNICAL_INDICATORS_DESCRIPTION = `
TradingView経由でテクニカル指標（RSI, MACD, BB, MA等）を取得します。

## When to Use
- テクニカル指標の数値が必要なとき（RSI、MACD、ボリンジャーバンド等）
- スクリーニングでテクニカル条件を使いたいとき
- チャートURLを生成したいとき

## When NOT to Use
- ファンダメンタル分析（→ get_financials, get_key_ratios）
- 有価証券報告書の内容確認（→ read_filings）
`;

/**
 * Create the get_technical_indicators tool.
 * Returns a fallback message when TradingView MCP is unavailable.
 */
export function createGetTechnicalIndicators(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_technical_indicators',
    description:
      'TradingView経由でテクニカル指標（RSI, MACD, BB, MA等）を取得します。',
    schema: z.object({
      symbol: z
        .string()
        .describe('銘柄コードまたは銘柄名（例: "7203" or "トヨタ自動車"）'),
      indicators: z
        .array(z.string())
        .optional()
        .describe(
          '取得する指標のリスト（例: ["RSI", "MACD", "BB"]）。省略時は主要指標すべて。',
        ),
    }),
    func: async ({ symbol, indicators }) => {
      if (!tradingviewAvailable) {
        return JSON.stringify({
          error:
            'TradingView MCPサーバーが利用できません。テクニカル指標はスクリーンショットからの読み取り、またはMCPサーバーの起動が必要です。',
          suggestion:
            'スクリーンショットを添付するか、TradingView MCPサーバーを起動してください。',
          symbol,
          indicators: indicators ?? 'all',
        });
      }

      // When MCP becomes available, this will delegate to the MCP tool
      return JSON.stringify({
        error: 'TradingView MCP integration not yet implemented.',
        symbol,
        indicators: indicators ?? 'all',
      });
    },
  });
}
