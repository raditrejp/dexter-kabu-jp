/**
 * EDINET DB API client.
 *
 * Provides access to the EDINET DB API (https://edinetdb.jp/v1)
 * for company search and disclosure document retrieval.
 *
 * Authentication: X-API-Key header.
 * Rate limiting: 10 requests/minute (conservative).
 * Retry: exponential backoff on 5xx errors and timeouts.
 */

import { RateLimiter } from '../../config/rate-limiter.js';

const BASE_URL = 'https://edinetdb.jp/v1';

/** Request timeout in milliseconds. */
const TIMEOUT_MS = 30_000;

/** Maximum retry attempts for transient errors. */
const MAX_RETRIES = 3;

export class EdinetClient {
  private readonly apiKey: string;
  private readonly rateLimiter: RateLimiter;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        'EDINET API key is required. Set EDINET_API_KEY environment variable.',
      );
    }
    this.apiKey = apiKey;
    this.rateLimiter = new RateLimiter(10); // 10 req/min conservative
  }

  /** Build the full URL for an EDINET DB API endpoint. */
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
   * Features:
   * - 30-second timeout via AbortController
   * - Exponential backoff on 5xx errors (1s, 2s, 4s)
   * - Retry on timeout errors
   * - X-API-Key authentication header
   */
  async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
    retries = MAX_RETRIES,
  ): Promise<T> {
    await this.rateLimiter.acquire();

    const url = this.buildUrl(path, params);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 5xx server errors
      if (response.status >= 500 && retries > 0) {
        const backoffMs = Math.pow(2, MAX_RETRIES - retries) * 1000;
        await this.sleep(backoffMs);
        return this.get<T>(path, params, retries - 1);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `EDINET API error ${response.status}: ${response.statusText} — ${body}`,
        );
      }

      return (await response.json()) as T;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // Retry on timeout (AbortError) or network errors
      const isAbort =
        error instanceof DOMException && error.name === 'AbortError';
      const isNetwork =
        error instanceof TypeError && error.message.includes('fetch');

      if ((isAbort || isNetwork) && retries > 0) {
        const backoffMs = Math.pow(2, MAX_RETRIES - retries) * 1000;
        await this.sleep(backoffMs);
        return this.get<T>(path, params, retries - 1);
      }

      throw error;
    }
  }

  /** Overridable for testing. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
