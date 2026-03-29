/**
 * JQuants API v2 plan configuration.
 *
 * Defines plan tiers, data-range limits, rate limits, and which API
 * endpoints are available on each plan.
 *
 * V2 endpoint paths: https://jpx-jquants.com/en/spec/migration-v1-v2
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
// V2 paths — see https://jpx-jquants.com/en/spec/migration-v1-v2

const FREE_ENDPOINTS = new Set([
  'equities/master',           // was: listed/info
  'equities/bars/daily',       // was: prices/daily_quotes
  'fins/summary',              // was: fins/statements
  'equities/earnings-calendar', // was: fins/announcement
]);

const LIGHT_ENDPOINTS = new Set([
  ...FREE_ENDPOINTS,
  'equities/investor-types',   // was: markets/trades_spec
  'indices/bars/daily/topix',  // was: indices/topix
]);

const STANDARD_ENDPOINTS = new Set([
  ...LIGHT_ENDPOINTS,
  'indices/bars/daily',                // was: indices
  'derivatives/bars/daily/options/225', // was: option/index_option
  'markets/margin-interest',           // was: markets/weekly_margin_interest
]);

const PREMIUM_ENDPOINTS = new Set([
  ...STANDARD_ENDPOINTS,
  'derivatives/bars/daily/futures',  // was: markets/futures
  'derivatives/bars/daily/options',  // was: markets/options
  'fins/dividend',                   // unchanged
  'fins/details',                    // was: fins/fs_details
  'markets/short-ratio',            // was: markets/short_selling
  'markets/short-sale-report',      // was: markets/short_selling_positions
  'markets/margin-alert',           // was: markets/daily_margin_interest
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
 * endpoint set, so `"equities/master"` will match the endpoint entry
 * `"equities/master"`.
 */
export function isEndpointAvailable(
  plan: JQuantsPlan,
  endpoint: string,
): boolean {
  const caps = PLAN_CAPABILITIES[plan];
  // Exact match first
  if (caps.endpoints.has(endpoint)) return true;
  // Prefix match: allow "equities/bars/daily" to match when caller
  // passes "equities/bars/daily?code=7203"
  for (const ep of caps.endpoints) {
    if (endpoint.startsWith(ep)) return true;
  }
  return false;
}
