/**
 * Config status checker — summarises environment setup for the intro screen.
 *
 * Inspects environment variables (and optionally MCP connectivity) to produce
 * a human-readable status string displayed on startup.
 */

import type { JQuantsPlan } from './plan.js';

// ── Types ────────────────────────────────────────────────────────────

interface EnvCheck {
  label: string;
  envVar: string;
  required?: boolean;
}

interface ConfigStatus {
  jquantsPlan: JQuantsPlan;
  jquantsConfigured: boolean;
  llmProvider: string | null;
  webSearch: string | null;
  edinetConfigured: boolean;
  xSearchConfigured: boolean;
  lines: string[];
}

// ── Env checks ───────────────────────────────────────────────────────

const LLM_PROVIDERS: EnvCheck[] = [
  { label: 'OpenAI', envVar: 'OPENAI_API_KEY' },
  { label: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { label: 'Google AI', envVar: 'GOOGLE_API_KEY' },
  { label: 'xAI', envVar: 'XAI_API_KEY' },
  { label: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY' },
  { label: 'Moonshot', envVar: 'MOONSHOT_API_KEY' },
  { label: 'OpenRouter', envVar: 'OPENROUTER_API_KEY' },
  { label: 'Ollama', envVar: 'OLLAMA_BASE_URL' },
];

const WEB_SEARCH_PROVIDERS: EnvCheck[] = [
  { label: 'Exa', envVar: 'EXASEARCH_API_KEY' },
  { label: 'Perplexity', envVar: 'PERPLEXITY_API_KEY' },
  { label: 'Tavily', envVar: 'TAVILY_API_KEY' },
];

// ── Plan labels ──────────────────────────────────────────────────────

const PLAN_LABELS: Record<JQuantsPlan, string> = {
  free: 'Free（無料）',
  light: 'Light',
  standard: 'Standard',
  premium: 'Premium',
};

const PLAN_FEATURE_NOTES: Record<JQuantsPlan, string> = {
  free: '株価12週 / 財務2年',
  light: '株価2年 / 財務5年',
  standard: '全期間 / 信用残高 / 投資部門別売買',
  premium: '全期間 / 空売り比率 / リアルタイム株価',
};

// ── Status builder ───────────────────────────────────────────────────

function isSet(envVar: string): boolean {
  const val = process.env[envVar];
  return val !== undefined && val !== '';
}

function findFirstConfigured(checks: EnvCheck[]): string | null {
  for (const check of checks) {
    if (isSet(check.envVar)) {
      return check.label;
    }
  }
  return null;
}

function findAllConfigured(checks: EnvCheck[]): string[] {
  return checks.filter((c) => isSet(c.envVar)).map((c) => c.label);
}

/**
 * Build a config status summary suitable for displaying on startup.
 */
export function getConfigStatus(): ConfigStatus {
  const plan = ((process.env.JQUANTS_PLAN as JQuantsPlan) ?? 'free') as JQuantsPlan;
  const jquantsConfigured = isSet('JQUANTS_API_KEY');
  const llmProviders = findAllConfigured(LLM_PROVIDERS);
  const llmProvider = llmProviders.length > 0 ? llmProviders.join(', ') : null;
  const webSearch = findFirstConfigured(WEB_SEARCH_PROVIDERS);
  const edinetConfigured = isSet('RADIKABUNAVI_API_KEY');
  const xSearchConfigured = isSet('X_BEARER_TOKEN');

  const ok = '\u2713';  // checkmark
  const ng = '\u2717';  // cross mark
  const lines: string[] = [];

  // JQuants status
  if (jquantsConfigured) {
    lines.push(`  ${ok} JQuants: ${PLAN_LABELS[plan]}（${PLAN_FEATURE_NOTES[plan]}）`);
  } else {
    lines.push(`  ${ng} JQuants: 未設定 -- JQUANTS_API_KEY を .env に設定してください`);
  }

  // LLM status
  if (llmProvider) {
    lines.push(`  ${ok} LLM: ${llmProvider}`);
  } else {
    lines.push(`  ${ng} LLM: 未設定 -- APIキーを1つ以上 .env に設定してください`);
  }

  // Optional data sources
  lines.push(`  ${edinetConfigured ? ok : ng} EDINET財務データ: ${edinetConfigured ? '有効（ラジ株ナビ MCP — 財務・スクリーナー）' : '未設定 -- RADIKABUNAVI_API_KEY を .env に設定してください（https://radikabunavi.com/mcp-service）'}`);
  lines.push(`  ${webSearch ? ok : '-'} Web検索: ${webSearch ?? '未設定（任意）'}`);
  lines.push(`  ${xSearchConfigured ? ok : '-'} X検索: ${xSearchConfigured ? '有効' : '未設定（任意）'}`);

  return {
    jquantsPlan: plan,
    jquantsConfigured,
    llmProvider,
    webSearch,
    edinetConfigured,
    xSearchConfigured,
    lines,
  };
}

/**
 * Format the config status as a single multi-line string for the TUI.
 */
export function formatConfigStatus(): string {
  const status = getConfigStatus();
  return status.lines.join('\n');
}
