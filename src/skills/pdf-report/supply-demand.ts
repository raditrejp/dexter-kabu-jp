/**
 * 需給データ取得モジュール
 * JQuants API v2 の信用取引週末残高（markets/margin-interest）から
 * 信用倍率・出来高比率を算出する。Standardプラン以上で利用可能。
 */

import { JQuantsClient } from '../../tools/finance/jquants-client.js';
import type { JQuantsPlan } from '../../config/index.js';

/** JQuants margin-interest APIのレスポンス1件 */
export interface MarginInterestRecord {
  Date: string;
  Code: string;
  LongVol: number;   // 買い残
  ShrtVol: number;   // 売り残
  LongNegVol: number;
  ShrtNegVol: number;
  LongStdVol: number;
  ShrtStdVol: number;
  IssType: string;
}

interface MarginInterestResponse {
  weekly_margin_interest?: MarginInterestRecord[];
  data?: MarginInterestRecord[];
}

/** 需給分析に必要なデータ */
export interface SupplyDemandData {
  marginBalanceRatio: number;  // 信用倍率（買い残 / 売り残）
  latestLongVol: number;       // 直近の買い残
  latestShortVol: number;      // 直近の売り残
  records: MarginInterestRecord[];
}

/**
 * 銘柄コードを5桁に正規化する
 */
function normalizeCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  return digits.length === 4 ? `${digits}0` : digits;
}

/**
 * JQuants APIから信用取引週末残高を取得し、信用倍率を算出する
 *
 * @param code 銘柄コード（4桁 or 5桁）
 * @param plan JQuantsプラン
 * @param weeksBack 何週間分取得するか（デフォルト12）
 * @returns 需給データ。プランが不足している場合はnull
 */
export async function fetchSupplyDemandData(
  code: string,
  plan: JQuantsPlan,
  weeksBack = 12,
): Promise<SupplyDemandData | null> {
  const planLevel = { free: 0, light: 1, standard: 2, premium: 3 }[plan] ?? 0;
  if (planLevel < 2) {
    return null; // Standard未満は利用不可
  }

  const client = new JQuantsClient(plan);
  const code5 = normalizeCode(code);

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - weeksBack * 7);

  const fromStr = formatDate(from);
  const toStr = formatDate(to);

  const response = await client.get<MarginInterestResponse>(
    'markets/margin-interest',
    { code: code5, from: fromStr, to: toStr },
  );

  const rawRecords = response.data ?? response.weekly_margin_interest ?? [];
  // IssType: "1"=信用, "2"=貸借。貸借銘柄は"2"で返る。両方を対象にする
  const records = rawRecords
    .filter((r) => r.IssType === '1' || r.IssType === '2')
    .sort((a, b) => a.Date.localeCompare(b.Date));

  if (records.length === 0) {
    return null;
  }

  const latest = records[records.length - 1];
  const marginBalanceRatio =
    latest.ShrtVol > 0 ? latest.LongVol / latest.ShrtVol : 999;

  return {
    marginBalanceRatio: Math.round(marginBalanceRatio * 100) / 100,
    latestLongVol: latest.LongVol,
    latestShortVol: latest.ShrtVol,
    records,
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
