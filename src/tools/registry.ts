import { StructuredToolInterface, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { exaSearch, perplexitySearch, tavilySearch, WEB_SEARCH_DESCRIPTION, xSearchTool, X_SEARCH_DESCRIPTION } from './search/index.js';
import { skillTool, SKILL_TOOL_DESCRIPTION } from './skill.js';
import { webFetchTool, WEB_FETCH_DESCRIPTION } from './fetch/web-fetch.js';
import { browserTool, BROWSER_DESCRIPTION } from './browser/browser.js';
import { readFileTool, READ_FILE_DESCRIPTION } from './filesystem/read-file.js';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from './filesystem/write-file.js';
import { editFileTool, EDIT_FILE_DESCRIPTION } from './filesystem/edit-file.js';
import { heartbeatTool, HEARTBEAT_TOOL_DESCRIPTION } from './heartbeat/heartbeat-tool.js';
import { cronTool, CRON_TOOL_DESCRIPTION } from './cron/cron-tool.js';
import { memoryGetTool, MEMORY_GET_DESCRIPTION, memorySearchTool, MEMORY_SEARCH_DESCRIPTION, memoryUpdateTool, MEMORY_UPDATE_DESCRIPTION } from './memory/index.js';
import { discoverSkills } from '../skills/index.js';
import type { JQuantsPlan } from '../config/index.js';
import { JQuantsClient } from './finance/jquants-client.js';
import { createGetStockPrice, GET_STOCK_PRICE_DESCRIPTION } from './finance/stock-price.js';
import { tradingviewAvailable, createGetTechnicalIndicators, GET_TECHNICAL_INDICATORS_DESCRIPTION } from './finance/tradingview.js';
import { tdnetAvailable, createGetDisclosures, GET_DISCLOSURES_DESCRIPTION } from './finance/tdnet.js';
import { RadikabuNaviClient } from './finance/radikabunavi-client.js';

// Cache MCP client to avoid duplicate init handshakes across getToolRegistry() calls
let cachedMcpClient: RadikabuNaviClient | null = null;
function getMcpClient(): RadikabuNaviClient | null {
  if (cachedMcpClient) return cachedMcpClient;
  const key = process.env.RADIKABUNAVI_API_KEY;
  if (!key) return null;
  try {
    cachedMcpClient = new RadikabuNaviClient(key);
    return cachedMcpClient;
  } catch {
    return null;
  }
}

/**
 * A registered tool with its rich description for system prompt injection.
 */
export interface RegisteredTool {
  /** Tool name (must match the tool's name property) */
  name: string;
  /** The actual tool instance */
  tool: StructuredToolInterface;
  /** Rich description for system prompt (includes when to use, when not to use, etc.) */
  description: string;
}

/**
 * Get all registered tools with their descriptions.
 * Conditionally includes tools based on environment configuration.
 *
 * @param model - The model name (needed for tools that require model-specific configuration)
 * @returns Array of registered tools
 */
export function getToolRegistry(model: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [
    {
      name: 'web_fetch',
      tool: webFetchTool,
      description: WEB_FETCH_DESCRIPTION,
    },
    {
      name: 'browser',
      tool: browserTool,
      description: BROWSER_DESCRIPTION,
    },
    {
      name: 'read_file',
      tool: readFileTool,
      description: READ_FILE_DESCRIPTION,
    },
    {
      name: 'write_file',
      tool: writeFileTool,
      description: WRITE_FILE_DESCRIPTION,
    },
    {
      name: 'edit_file',
      tool: editFileTool,
      description: EDIT_FILE_DESCRIPTION,
    },
    {
      name: 'heartbeat',
      tool: heartbeatTool,
      description: HEARTBEAT_TOOL_DESCRIPTION,
    },
    {
      name: 'cron',
      tool: cronTool,
      description: CRON_TOOL_DESCRIPTION,
    },
    {
      name: 'memory_search',
      tool: memorySearchTool,
      description: MEMORY_SEARCH_DESCRIPTION,
    },
    {
      name: 'memory_get',
      tool: memoryGetTool,
      description: MEMORY_GET_DESCRIPTION,
    },
    {
      name: 'memory_update',
      tool: memoryUpdateTool,
      description: MEMORY_UPDATE_DESCRIPTION,
    },
  ];

  // Include web_search if Exa, Perplexity, or Tavily API key is configured (Exa → Perplexity → Tavily)
  if (process.env.EXASEARCH_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: exaSearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  } else if (process.env.PERPLEXITY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: perplexitySearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  } else if (process.env.TAVILY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: tavilySearch,
      description: WEB_SEARCH_DESCRIPTION,
    });
  }

  // Include x_search if X Bearer Token is configured
  if (process.env.X_BEARER_TOKEN) {
    tools.push({
      name: 'x_search',
      tool: xSearchTool,
      description: X_SEARCH_DESCRIPTION,
    });
  }

  // Include skill tool if any skills are available
  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.push({
      name: 'skill',
      tool: skillTool,
      description: SKILL_TOOL_DESCRIPTION,
    });
  }

  // ── Japanese Stock Finance Tools ─────────────────────────────────

  // JQuants API — stock price data
  if (process.env.JQUANTS_API_KEY) {
    try {
      const jquantsPlan = (process.env.JQUANTS_PLAN as JQuantsPlan) ?? 'free';
      const jquantsClient = new JQuantsClient(jquantsPlan);
      tools.push({
        name: 'get_stock_price',
        tool: createGetStockPrice(jquantsClient),
        description: GET_STOCK_PRICE_DESCRIPTION,
      });
    } catch {
      // JQuants client initialization failed — skip
    }
  }

  // ラジ株ナビ MCP — financials, screener (via EDINET data)
  const mcpClient = getMcpClient();
  if (mcpClient) {

      tools.push(
        {
          name: 'get_financials',
          tool: new DynamicStructuredTool({
            name: 'get_financials',
            description: '日本企業の財務データ（売上、利益、ROE等）をEDINETデータから取得します。',
            schema: z.object({
              code: z.string().describe('証券コード（例: "7203"）'),
              metrics: z.array(z.string()).optional().describe('取得する指標名の配列（省略時はデフォルト指標セット）'),
              fiscalYear: z.string().optional().describe('特定の決算期末日（YYYY-MM-DD）。省略時は全年度'),
            }),
            func: async ({ code, metrics, fiscalYear }) => {
              try {
                const args: Record<string, unknown> = { code };
                if (metrics) args.metrics = metrics;
                if (fiscalYear) args.fiscalYear = fiscalYear;
                return await mcpClient.callTool('get_edinet_financial_data', args);
              } catch (error: unknown) {
                return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
              }
            },
          }),
          description: `日本企業の財務データ（EDINET有価証券報告書ベース）を取得します。

## When to Use
- 決算データ（売上高、営業利益、純利益等）を確認したいとき
- 財務指標（ROE、ROA、自己資本比率等）が必要なとき
- 過去複数年の推移を分析したいとき

## When NOT to Use
- 株価データが必要なとき（→ get_stock_price）
- テクニカル指標が必要なとき（→ get_technical_indicators）`,
        },
        {
          name: 'get_key_ratios',
          tool: new DynamicStructuredTool({
            name: 'get_key_ratios',
            description: '日本企業の主要財務指標サマリーを取得。',
            schema: z.object({
              code: z.string().describe('証券コード（例: "7203"）'),
            }),
            func: async ({ code }) => {
              try {
                return await mcpClient.callTool('get_edinet_financial_summary', { code });
              } catch (error: unknown) {
                return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
              }
            },
          }),
          description: `日本企業の主要財務指標サマリーを取得。

## When to Use
- PER、PBR、ROE等のバリュエーション指標を確認したいとき
- 銘柄の財務概要をざっくり把握したいとき

## When NOT to Use
- 詳細な財務データや推移が必要なとき（→ get_financials）
- 株価データが必要なとき（→ get_stock_price）`,
        },
        {
          name: 'company_screener',
          tool: new DynamicStructuredTool({
            name: 'company_screener',
            description: '日本株スクリーニング。条件を指定して銘柄を絞り込み。',
            schema: z.object({
              conditions: z.array(z.object({
                metric: z.string().describe('指標名（例: roe, operatingMargin, equityRatio）'),
                operator: z.enum(['>=', '<=', '>', '<', '==']).describe('比較演算子'),
                value: z.number().describe('比較値'),
              })).describe('スクリーニング条件の配列（AND条件）'),
              sort: z.object({
                metric: z.string(),
                order: z.enum(['asc', 'desc']),
              }).optional().describe('ソート条件'),
              limit: z.number().optional().describe('返す件数の上限（デフォルト30）'),
              sector: z.string().optional().describe('業種で絞り込み'),
              market: z.string().optional().describe('市場で絞り込み（例: プライム）'),
            }),
            func: async ({ conditions, sort, limit, sector, market }) => {
              try {
                const args: Record<string, unknown> = { conditions };
                if (sort) args.sort = sort;
                if (limit) args.limit = limit;
                if (sector) args.sector = sector;
                if (market) args.market = market;
                return await mcpClient.callTool('screen_stocks', args);
              } catch (error: unknown) {
                return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
              }
            },
          }),
          description: `日本株スクリーニング。約4,000社の財務データから条件検索。

## When to Use
- 特定条件に合う銘柄を探したいとき（例: 「ROE15%以上かつPBR1倍以下」）
- セクター・市場別の銘柄リストが必要なとき

## When NOT to Use
- 特定銘柄の詳細分析（→ get_financials）
- テクニカル条件でのスクリーニング（→ get_technical_indicators）

## 利用可能な指標例
roe, operatingMargin, equityRatio, salesGrowth, netCash, fcf, dividendPerShare 等108指標`,
        },
      );
  }

  // TradingView MCP — technical indicators (detection is sync; actual
  // MCP availability is set via detectTradingViewMCP() at startup)
  if (tradingviewAvailable) {
    tools.push({
      name: 'get_technical_indicators',
      tool: createGetTechnicalIndicators(),
      description: GET_TECHNICAL_INDICATORS_DESCRIPTION,
    });
  }

  // TDnet MCP — disclosures
  if (tdnetAvailable) {
    tools.push({
      name: 'get_disclosures',
      tool: createGetDisclosures(),
      description: GET_DISCLOSURES_DESCRIPTION,
    });
  }

  return tools;
}

/**
 * Get just the tool instances for binding to the LLM.
 *
 * @param model - The model name
 * @returns Array of tool instances
 */
export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 * Formats each tool's rich description with a header.
 *
 * @param model - The model name
 * @returns Formatted string with all tool descriptions
 */
export function buildToolDescriptions(model: string): string {
  return getToolRegistry(model)
    .map((t) => `### ${t.name}\n\n${t.description}`)
    .join('\n\n');
}
