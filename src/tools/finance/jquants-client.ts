/**
 * JQuants API v2 client.
 *
 * Token-based authentication flow:
 *   1. POST /token/auth_user  → refreshToken
 *   2. GET  /token/auth_refresh?refreshtoken=XXX → idToken
 *   3. Use idToken as Authorization: Bearer header
 *   4. Token expires in ~24h; proactively refresh at 23h
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

/** Proactively refresh 1 hour before the 24h expiry. */
const TOKEN_LIFETIME_MS = 23 * 60 * 60 * 1000; // 23 hours

/** Retry backoff base for 429s (exponential: 2s, 4s, 8s). */
const BACKOFF_BASE_MS = 2000;
const MAX_RETRIES = 3;

export class JQuantsClient {
  private readonly mail: string;
  private readonly password: string;
  private readonly plan: JQuantsPlan;
  private readonly rateLimiter: RateLimiter;

  private idToken: string | undefined;
  private refreshToken: string | undefined;
  private tokenExpiresAt = 0;

  constructor(plan: JQuantsPlan) {
    const mail = process.env.JQUANTS_MAIL;
    const password = process.env.JQUANTS_PASSWORD;

    if (!mail) {
      throw new Error(
        'JQUANTS_MAIL environment variable is required for JQuants API authentication.',
      );
    }
    if (!password) {
      throw new Error(
        'JQUANTS_PASSWORD environment variable is required for JQuants API authentication.',
      );
    }

    this.mail = mail;
    this.password = password;
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
   * Automatically ensures a valid token, applies rate limiting,
   * and retries on 429 with exponential backoff.
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

    await this.ensureToken();
    await this.rateLimiter.acquire();

    const url = this.buildUrl(path, params);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.idToken}`,
      },
    });

    // Handle rate limiting (429)
    if (response.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        throw new Error(
          `JQuants API rate limit exceeded after ${MAX_RETRIES} retries: ${url}`,
        );
      }
      const backoffMs = BACKOFF_BASE_MS * Math.pow(2, retryCount);
      await this.sleep(backoffMs);
      return this.get<T>(path, params, retryCount + 1);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `JQuants API error ${response.status}: ${response.statusText} — ${body}`,
      );
    }

    return (await response.json()) as T;
  }

  // ── Authentication ──────────────────────────────────────────────

  /**
   * Full authentication: get refresh token, then ID token.
   */
  async authenticate(): Promise<void> {
    // Step 1: Get refresh token
    const authResponse = await fetch(`${BASE_URL}/token/auth_user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailaddress: this.mail,
        password: this.password,
      }),
    });

    if (!authResponse.ok) {
      const body = await authResponse.text().catch(() => '');
      throw new Error(
        `JQuants auth_user failed (${authResponse.status}): ${body}`,
      );
    }

    const authData = (await authResponse.json()) as {
      refreshToken: string;
    };
    this.refreshToken = authData.refreshToken;

    // Step 2: Exchange refresh token for ID token
    await this.refreshIdToken();
  }

  /**
   * Refresh the ID token using the stored refresh token.
   */
  async refreshIdToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error(
        'No refresh token available. Call authenticate() first.',
      );
    }

    const refreshUrl = `${BASE_URL}/token/auth_refresh?refreshtoken=${encodeURIComponent(this.refreshToken)}`;
    const response = await fetch(refreshUrl, { method: 'GET' });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `JQuants auth_refresh failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as { idToken: string };
    this.idToken = data.idToken;
    this.tokenExpiresAt = Date.now() + TOKEN_LIFETIME_MS;
  }

  /**
   * Ensure we have a valid ID token. Authenticates or refreshes as needed.
   */
  async ensureToken(): Promise<void> {
    // No token at all — full auth
    if (!this.idToken) {
      await this.authenticate();
      return;
    }

    // Token about to expire — refresh
    if (Date.now() >= this.tokenExpiresAt) {
      try {
        await this.refreshIdToken();
      } catch {
        // Refresh token may have expired too — full re-auth
        await this.authenticate();
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Overridable for testing. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
