/**
 * JQuants API plan configuration.
 *
 * Defines plan tiers, data-range limits, rate limits, and which API
 * endpoints are available on each plan.
 */

// ── Plan types ──────────────────────────────────────────────────────

export type JQuantsPlan = 'free' | 'light' | 'standard' | 'premium';

export interface PlanCapabilities {
  /** Maximum historical data range in weeks. */
  dataRangeWeeks: number;
  /** API rate limit — max requests per 60-second sliding window. */
  rateLimitPerMinute: number;
  /** Set of endpoint path prefixes available on this plan. */
  endpoints: ReadonlySet<string>;
}

// ── Endpoint sets (cumulative) ──────────────────────────────────────

const FREE_ENDPOINTS = new Set([
  'listed/info',
  'prices/daily_quotes',
  'fins/statements',
  'fins/announcement',
]);

const LIGHT_ENDPOINTS = new Set([
  ...FREE_ENDPOINTS,
  'markets/trades_spec',
  'indices/topix',
]);

const STANDARD_ENDPOINTS = new Set([
  ...LIGHT_ENDPOINTS,
  'indices',
  'option/index_option',
]);

const PREMIUM_ENDPOINTS = new Set([
  ...STANDARD_ENDPOINTS,
  'markets/futures',
  'markets/options',
  'fins/dividend',
  'fins/fs_details',
]);

// ── Plan capabilities constant ──────────────────────────────────────

export const PLAN_CAPABILITIES: Record<JQuantsPlan, PlanCapabilities> = {
  free: {
    dataRangeWeeks: 12,
    rateLimitPerMinute: 5,
    endpoints: FREE_ENDPOINTS,
  },
  light: {
    dataRangeWeeks: 260,
    rateLimitPerMinute: 60,
    endpoints: LIGHT_ENDPOINTS,
  },
  standard: {
    dataRangeWeeks: 520,
    rateLimitPerMinute: 120,
    endpoints: STANDARD_ENDPOINTS,
  },
  premium: {
    dataRangeWeeks: 1040,
    rateLimitPerMinute: 500,
    endpoints: PREMIUM_ENDPOINTS,
  },
} as const;

// ── Helper functions ────────────────────────────────────────────────

/**
 * Return the full capabilities object for a given plan.
 */
export function getPlanCapabilities(plan: JQuantsPlan): PlanCapabilities {
  return PLAN_CAPABILITIES[plan];
}

/**
 * Check whether a specific endpoint path is available on the given plan.
 *
 * The `endpoint` argument is matched as a prefix against the plan's
 * endpoint set, so `"listed/info"` will match the endpoint entry
 * `"listed/info"`.
 */
export function isEndpointAvailable(
  plan: JQuantsPlan,
  endpoint: string,
): boolean {
  const caps = PLAN_CAPABILITIES[plan];
  // Exact match first
  if (caps.endpoints.has(endpoint)) return true;
  // Prefix match: allow "prices/daily_quotes" to match when caller
  // passes "prices/daily_quotes?code=7203"
  for (const ep of caps.endpoints) {
    if (endpoint.startsWith(ep)) return true;
  }
  return false;
}
