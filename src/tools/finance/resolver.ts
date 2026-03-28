/**
 * Company resolver — maps securities codes, EDINET codes, or company names
 * to a unified CompanyInfo record.
 *
 * Resolution flow:
 *   1. Check in-memory cache (cross-indexed by code, name, edinetCode)
 *   2. Call EDINET DB `/search` endpoint
 *   3. Parse response, cache result, return CompanyInfo
 */

import type { EdinetClient } from './edinet-client.js';

export interface CompanyInfo {
  /** 4-digit securities code (e.g., "7203") */
  code: string;
  /** 5-digit JQuants code (e.g., "72030") */
  code5: string;
  /** Company name (e.g., "トヨタ自動車") */
  name: string;
  /** EDINET code (e.g., "E02144") */
  edinetCode: string;
  /** TSE 33-sector classification */
  sector33?: string;
}

/** EDINET /search response shape (partial). */
interface EdinetSearchResult {
  results?: Array<{
    edinet_code?: string;
    securities_code?: string;
    filer_name?: string;
    sector33?: string;
  }>;
}

export class CompanyResolver {
  private readonly edinetClient: EdinetClient;
  private readonly cache = new Map<string, CompanyInfo>();

  constructor(edinetClient: EdinetClient) {
    this.edinetClient = edinetClient;
  }

  // ── Static helpers ──────────────────────────────────────────────

  /**
   * Convert a 4-digit securities code to a 5-digit JQuants code.
   * Appends "0" as the check digit.
   */
  static normalize4To5Digit(code4: string): string {
    return `${code4}0`;
  }

  /**
   * Check if the input looks like a 4-digit securities code (e.g., "7203").
   */
  static isSecuritiesCode(input: string): boolean {
    return /^\d{4}$/.test(input);
  }

  /**
   * Check if the input looks like an EDINET code (e.g., "E02144").
   */
  static isEdinetCode(input: string): boolean {
    return /^E\d{5}$/.test(input);
  }

  // ── Cache ──────────────────────────────────────────────────────

  /**
   * Store a CompanyInfo in the cache, cross-indexed by code, name, and edinetCode.
   */
  cacheSet(key: string, info: CompanyInfo): void {
    this.cache.set(key, info);
    // Cross-index by all identifiers
    this.cache.set(info.code, info);
    this.cache.set(info.code5, info);
    this.cache.set(info.name, info);
    this.cache.set(info.edinetCode, info);
  }

  /**
   * Retrieve a CompanyInfo from the cache by any indexed key.
   */
  cacheGet(key: string): CompanyInfo | undefined {
    return this.cache.get(key);
  }

  // ── Resolution ────────────────────────────────────────────────

  /**
   * Resolve a securities code, EDINET code, or company name to CompanyInfo.
   *
   * Checks the cache first, then queries the EDINET DB API.
   */
  async resolve(input: string): Promise<CompanyInfo> {
    const trimmed = input.trim();

    // Check cache first
    const cached = this.cacheGet(trimmed);
    if (cached) return cached;

    // Build search params based on input type
    const params: Record<string, string> = {};
    if (CompanyResolver.isSecuritiesCode(trimmed)) {
      params.securities_code = trimmed;
    } else if (CompanyResolver.isEdinetCode(trimmed)) {
      params.edinet_code = trimmed;
    } else {
      params.filer_name = trimmed;
    }

    const response = await this.edinetClient.get<EdinetSearchResult>(
      'search',
      params,
    );

    const entry = response.results?.[0];
    if (!entry || !entry.securities_code || !entry.edinet_code || !entry.filer_name) {
      throw new Error(
        `Company not found for input: "${trimmed}"`,
      );
    }

    const code4 = entry.securities_code.slice(0, 4);
    const info: CompanyInfo = {
      code: code4,
      code5: CompanyResolver.normalize4To5Digit(code4),
      name: entry.filer_name,
      edinetCode: entry.edinet_code,
      sector33: entry.sector33,
    };

    // Cache with cross-indexing
    this.cacheSet(trimmed, info);

    return info;
  }
}
