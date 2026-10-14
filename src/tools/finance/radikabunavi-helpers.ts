/**
 * ラジ株ナビ MCP の応答を読む純関数（ネットワークを使わないのでテストしやすい）。
 */

/** get_key_ratios が取り出す指標（get_edinet_financial_data の metrics に渡す英語キー）。 */
export const KEY_RATIO_METRICS = [
  'per',
  'pbr',
  'roe',
  'roa',
  'equityRatio',
  'operatingMargin',
  'ordinaryMargin',
  'netProfitMargin',
  'dividendYield',
  'payoutRatio',
  'eps',
  'bps',
  'dividendPerShare',
  'marketCap',
  'salesGrowth',
] as const;

/**
 * get_edinet_financial_data の応答（JSON文字列）から、最新の実績年度の主要指標を取り出す。
 *
 * - fiscalYears は年度末日（YYYY-MM-DD）をキーとするオブジェクト。最新キーを使う。
 * - 値は有報の決算時点のもの（PER・PBR・配当利回りは決算時の擬似株価ベース）。市場の現在値ではない。
 * - 取得できなかった指標は出力に含めない（null を成功値として見せない）。
 */
export function extractKeyRatios(raw: string, code: string): Record<string, unknown> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`ラジ株ナビMCPの応答を JSON として読めませんでした: ${raw.slice(0, 120)}`);
  }
  const fiscalYears = data.fiscalYears as Record<string, Record<string, unknown>> | undefined;
  const keys = fiscalYears ? Object.keys(fiscalYears).sort() : [];
  if (!fiscalYears || keys.length === 0) {
    throw new Error(`銘柄 ${code} の財務データ（fiscalYears）が見つかりませんでした。`);
  }
  const latestKey = keys[keys.length - 1];
  const latest = fiscalYears[latestKey] ?? {};

  const ratios: Record<string, unknown> = {};
  for (const metric of KEY_RATIO_METRICS) {
    const v = latest[metric];
    if (v !== undefined && v !== null) ratios[metric] = v;
  }

  return {
    code,
    companyName: data.companyName ?? null,
    fiscalYearEnd: latestKey,
    note: 'PER・PBR・配当利回り等は有価証券報告書の決算時点の値（決算時の擬似株価ベース）で、市場の現在値ではありません。',
    ratios,
  };
}

export interface SectorMarket {
  sector: string;
  market: string;
}

/**
 * search_stocks の応答（JSON文字列。{ query, matchedCount, results: [{ code, companyName, sector, market, ... }] }）
 * から、証券コードが一致する行の業種・市場を取り出す。一致する行が無ければ null。
 * コードは 4桁（`7203`）・英字入り（`140A`）・5桁（`72030`）のいずれで渡されても一致させる。
 */
export function parseSectorMarket(raw: string, code: string): SectorMarket | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const results = (data as { results?: unknown })?.results;
  if (!Array.isArray(results)) return null;
  const want = code.normalize('NFKC').trim().toUpperCase();
  const code4 = want.length === 5 && want.endsWith('0') ? want.slice(0, 4) : want;
  const match = results.find(
    (r: Record<string, unknown>) => String(r?.code ?? '').toUpperCase() === code4,
  ) as Record<string, unknown> | undefined;
  if (!match) return null;
  return {
    sector: typeof match.sector === 'string' ? match.sector : '',
    market: typeof match.market === 'string' ? match.market : '',
  };
}

/**
 * get_stock_analysis（総合分析）の応答（JSON文字列）を LLM に渡す形に整える。
 *
 * - 回数不足で返さなかったセクション（usage.withheld）があるとき、先頭に userNotice を足す。
 *   サーバーの usage.withheldNote（有料プランの案内つき）をそのまま使い、必ず利用者に伝えさせる。
 * - 値は加工しない。JSON として読めない・withheld が無い場合は入力をそのまま返す。
 */
export function formatStockAnalysis(raw: string): string {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return raw;
  const usage = (data as { usage?: { withheld?: unknown; withheldNote?: unknown } }).usage;
  const withheld = Array.isArray(usage?.withheld) ? (usage.withheld as Array<{ title?: unknown }>) : [];
  if (withheld.length === 0) return raw;
  const titles = withheld.map((w) => (typeof w?.title === 'string' ? w.title : '')).filter(Boolean).join('、');
  const note = typeof usage?.withheldNote === 'string' && usage.withheldNote
    ? usage.withheldNote
    : `今日の利用回数が足りないため、次のセクションは返していません: ${titles}。`;
  return JSON.stringify({ userNotice: `${note}\n分析結果を伝えるとき、返していないセクションがあることを必ず利用者に伝えてください。`, ...(data as object) });
}
