/**
 * JQuants API v2 client.
 *
 * API Key authentication (V2):
 *   - Pass API Key via `x-api-key` header on every request.
 *   - No token lifecycle management needed (API Key has no expiration).
 *   - API Key is issued from the JQuants dashboard.
 *
 * Rate limiting is handled via the shared RateLimiter (sliding window).
 */

import {
  type JQuantsPlan,
  getPlanCapabilities,
  isEndpointAvailable,
  RateLimiter,
} from '../../config/index.js';

const BASE_URL = 'https://api.jquants.com/v2';

/** Retry backoff base for 429s (exponential: 2s, 4s, 8s). */
const BACKOFF_BASE_MS = 2000;
const MAX_RETRIES = 3;

export class JQuantsClient {
  private readonly apiKey: string;
  private readonly plan: JQuantsPlan;
  private readonly rateLimiter: RateLimiter;

  constructor(plan: JQuantsPlan) {
    const apiKey = process.env.JQUANTS_API_KEY;

    if (!apiKey) {
      throw new Error(
        'JQUANTS_API_KEY environment variable is required. Get your API Key from https://jpx-jquants.com/ja/dashboard/api-keys',
      );
    }
    // Reject control characters to prevent HTTP header injection (CRLF)
    if (/[\r\n\x00]/.test(apiKey)) {
      throw new Error('JQUANTS_API_KEY contains invalid characters.');
    }

    this.apiKey = apiKey;
    this.plan = plan;

    const caps = getPlanCapabilities(plan);
    this.rateLimiter = new RateLimiter(caps.rateLimitPerMinute);
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Data range in weeks for the configured plan. */
  get dataRangeWeeks(): number {
    return getPlanCapabilities(this.plan).dataRangeWeeks;
  }

  /** Check if an endpoint is available on the current plan. */
  isAvailable(endpoint: string): boolean {
    return isEndpointAvailable(this.plan, endpoint);
  }

  /** Build the full URL for a JQuants API endpoint. */
  buildUrl(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): string {
    const url = new URL(`${BASE_URL}/${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Perform a rate-limited, authenticated GET request.
   *
   * Applies rate limiting and retries on 429 with exponential backoff.
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    retryCount = 0,
  ): Promise<T> {
    if (!this.isAvailable(path)) {
      throw new Error(
        `Endpoint "${path}" is not available on the "${this.plan}" plan.`,
      );
    }

    await this.rateLimiter.acquire();

    const url = this.buildUrl(path, params);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': this.apiKey,
      },
    });

    // Handle rate limiting (429)
    if (response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        throw new Error(
          'JQuants APIのレート制限に達しました。しばらく待ってからお試しください。',
        );
      }
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, retryCount);
      await this.sleep(backoffMs);
      return this.get<T>(path, params, retryCount + 1);
    }

    if (!response.ok) {
      // Do not expose response body — may contain internal API details
      if (response.status === 401 || response.status === 403) {
        throw new Error('JQuants API認証エラーです。JQUANTS_API_KEYを確認してください。');
      }
      throw new Error(`JQuants APIエラー（ステータス: ${response.status}）`);
    }

    return (await response.json()) as T;
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Overridable for testing. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
