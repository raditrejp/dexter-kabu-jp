import { StructuredToolInterface } from '@langchain/core/tools';
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
import { EdinetClient } from './finance/edinet-client.js';
import { CompanyResolver } from './finance/resolver.js';
import { createGetStockPrice, GET_STOCK_PRICE_DESCRIPTION } from './finance/stock-price.js';
import { createGetFinancials, GET_FINANCIALS_DESCRIPTION } from './finance/financials.js';
import { createReadFilings, READ_FILINGS_DESCRIPTION } from './finance/read-filings.js';
import { createGetKeyRatios, GET_KEY_RATIOS_DESCRIPTION } from './finance/key-ratios.js';
import { createCompanyScreener, COMPANY_SCREENER_DESCRIPTION } from './finance/screener.js';
import { tradingviewAvailable, createGetTechnicalIndicators, GET_TECHNICAL_INDICATORS_DESCRIPTION } from './finance/tradingview.js';
import { tdnetAvailable, createGetDisclosures, GET_DISCLOSURES_DESCRIPTION } from './finance/tdnet.js';

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
  if (process.env.JQUANTS_MAIL) {
    try {
      const jquantsPlan = (process.env.JQUANTS_PLAN as JQuantsPlan) ?? 'free';
      const jquantsClient = new JQuantsClient(jquantsPlan);
      tools.push({
        name: 'get_stock_price',
        tool: createGetStockPrice(jquantsClient),
        description: GET_STOCK_PRICE_DESCRIPTION,
      });
    } catch {
      // JQuants client initialization failed (e.g., missing password) — skip
    }
  }

  // EDINET DB API — financials, filings, ratios, screener
  if (process.env.EDINETDB_API_KEY) {
    try {
      const edinetClient = new EdinetClient(process.env.EDINETDB_API_KEY);
      const resolver = new CompanyResolver(edinetClient);

      tools.push(
        {
          name: 'get_financials',
          tool: createGetFinancials(edinetClient, resolver),
          description: GET_FINANCIALS_DESCRIPTION,
        },
        {
          name: 'read_filings',
          tool: createReadFilings(edinetClient, resolver),
          description: READ_FILINGS_DESCRIPTION,
        },
        {
          name: 'get_key_ratios',
          tool: createGetKeyRatios(edinetClient, resolver),
          description: GET_KEY_RATIOS_DESCRIPTION,
        },
        {
          name: 'company_screener',
          tool: createCompanyScreener(edinetClient),
          description: COMPANY_SCREENER_DESCRIPTION,
        },
      );
    } catch {
      // EDINET client initialization failed — skip
    }
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
