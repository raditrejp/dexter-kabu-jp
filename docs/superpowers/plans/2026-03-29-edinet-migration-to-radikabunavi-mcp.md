# EDINET → ラジ株ナビ MCP 移行計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 架空の edinetdb.jp API を叩いているコードを全て削除し、ラジ株ナビ MCP サーバー（`https://radikabunavi.com/mcp`）経由で財務データ・スクリーニング機能を提供するように移行する。

**Architecture:** edinet-client.ts とそれに依存する4つのツール（get_financials, get_key_ratios, company_screener, read_filings）および CompanyResolver を削除。代わりにラジ株ナビ MCP が提供する4つのツール（get_edinet_financial_data, get_edinet_financial_summary, screen_stocks, list_edinet_stocks）をMCPプロトコル経由で利用する。MCP接続は Streamable HTTP（`mcp-session-id` ヘッダーによるセッション管理）。環境変数 `EDINETDB_API_KEY` を `RADIKABUNAVI_API_KEY` にリネーム。

**Tech Stack:** TypeScript, Bun, MCP (Streamable HTTP), JSON-RPC 2.0

---

## ファイル構造

### 削除するファイル
- `src/tools/finance/edinet-client.ts` — 架空API クライアント
- `src/tools/finance/resolver.ts` — EdinetClient依存の企業検索
- `src/tools/finance/financials.ts` — edinetdb.jp/v1/financials を叩くツール
- `src/tools/finance/key-ratios.ts` — edinetdb.jp/v1/key-ratios を叩くツール
- `src/tools/finance/screener.ts` — edinetdb.jp/v1/screener を叩くツール
- `src/tools/finance/read-filings.ts` — edinetdb.jp/v1/text-blocks を叩くツール
- `src/tools/finance/__tests__/edinet-client.test.ts` — 架空APIのテスト
- `src/tools/finance/__tests__/resolver.test.ts` — Resolver のテスト

### 新規作成するファイル
- `src/tools/finance/radikabunavi-client.ts` — ラジ株ナビ MCP クライアント
- `src/tools/finance/__tests__/radikabunavi-client.test.ts` — MCPクライアントのテスト

### 変更するファイル
- `src/tools/finance/index.ts` — export の差し替え
- `src/tools/registry.ts` — EDINETDB_API_KEY → RADIKABUNAVI_API_KEY、ツール登録の変更
- `src/config/setup.ts` — 起動時ステータス表示の変更
- `env.example` — 環境変数の変更
- `README.md` — EDINET API → ラジ株ナビ MCP への記述変更
- `README.en.md` — 同上（英語版）
- `src/skills/altman-z/SKILL.md` — データソース記述をMCPに変更

---

## Task 1: 架空 EDINET クライアントとツールの削除

**Files:**
- Delete: `src/tools/finance/edinet-client.ts`
- Delete: `src/tools/finance/resolver.ts`
- Delete: `src/tools/finance/financials.ts`
- Delete: `src/tools/finance/key-ratios.ts`
- Delete: `src/tools/finance/screener.ts`
- Delete: `src/tools/finance/read-filings.ts`
- Delete: `src/tools/finance/__tests__/edinet-client.test.ts`
- Delete: `src/tools/finance/__tests__/resolver.test.ts`

- [ ] **Step 1: 削除前に依存関係を確認**

Run: `grep -r "edinet-client\|EdinetClient\|CompanyResolver\|createGetFinancials\|createGetKeyRatios\|createCompanyScreener\|createReadFilings" src/ --include="*.ts" -l`

以下のファイルのみが依存しているはず:
- `src/tools/finance/index.ts`
- `src/tools/registry.ts`
- 上記の削除対象ファイル自身

- [ ] **Step 2: ファイルを削除**

```bash
rm src/tools/finance/edinet-client.ts
rm src/tools/finance/resolver.ts
rm src/tools/finance/financials.ts
rm src/tools/finance/key-ratios.ts
rm src/tools/finance/screener.ts
rm src/tools/finance/read-filings.ts
rm src/tools/finance/__tests__/edinet-client.test.ts
rm src/tools/finance/__tests__/resolver.test.ts
```

- [ ] **Step 3: `src/tools/finance/index.ts` から削除したモジュールの export を除去**

以下の export を削除:
- `EdinetClient`
- `CompanyResolver`, `CompanyInfo`
- `createGetFinancials`, `GET_FINANCIALS_DESCRIPTION`
- `createReadFilings`, `READ_FILINGS_DESCRIPTION`
- `createGetKeyRatios`, `GET_KEY_RATIOS_DESCRIPTION`
- `createCompanyScreener`, `COMPANY_SCREENER_DESCRIPTION`

- [ ] **Step 4: `src/tools/registry.ts` から EDINET 関連コードを除去**

- import 文の削除: `EdinetClient`, `CompanyResolver`, `createGetFinancials`, `createReadFilings`, `createGetKeyRatios`, `createCompanyScreener` とその DESCRIPTION 定数
- `if (process.env.EDINETDB_API_KEY)` ブロック全体（L155-186）を削除

- [ ] **Step 5: `src/tools/finance/stock-price.ts` の CompanyResolver 依存を確認**

`get_stock_price` ツールは `CompanyResolver.isSecuritiesCode` と `CompanyResolver.normalize4To5Digit` を静的メソッドとして使用している。これらは CompanyResolver 削除後もインラインで残す必要がある。

`stock-price.ts` に以下のヘルパーをインラインで追加:

```typescript
function isSecuritiesCode(input: string): boolean {
  return /^\d{4}$/.test(input);
}

function normalize4To5Digit(code4: string): string {
  return `${code4}0`;
}
```

既存の `CompanyResolver.isSecuritiesCode` / `CompanyResolver.normalize4To5Digit` の呼び出しをこれらに差し替え、import を削除。

- [ ] **Step 6: ビルド確認**

Run: `bun run build` (or `bunx tsc --noEmit`)
Expected: エラーなし

- [ ] **Step 7: テスト実行**

Run: `bun test`
Expected: 削除したテスト以外は PASS

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "refactor: remove defunct edinetdb.jp client and dependent tools

The edinet-client.ts was hitting edinetdb.jp, a non-existent/wrong service.
All financial data tools (get_financials, get_key_ratios, company_screener,
read_filings) and CompanyResolver are removed. Will be replaced by
radikabunavi MCP in the next task."
```

---

## Task 2: ラジ株ナビ MCP クライアントの実装

**Files:**
- Create: `src/tools/finance/radikabunavi-client.ts`
- Test: `src/tools/finance/__tests__/radikabunavi-client.test.ts`

- [ ] **Step 1: テストファイルを作成**

```typescript
// src/tools/finance/__tests__/radikabunavi-client.test.ts
import { describe, test, expect } from 'bun:test';
import { RadikabuNaviClient } from '../radikabunavi-client.js';

describe('RadikabuNaviClient', () => {
  test('throws if API key is empty', () => {
    expect(() => new RadikabuNaviClient('')).toThrow('RADIKABUNAVI_API_KEY');
  });

  test('constructs with valid API key', () => {
    const client = new RadikabuNaviClient('rk_test_key');
    expect(client).toBeDefined();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `bun test src/tools/finance/__tests__/radikabunavi-client.test.ts`
Expected: FAIL — `RadikabuNaviClient` が存在しない

- [ ] **Step 3: MCP クライアントを実装**

```typescript
// src/tools/finance/radikabunavi-client.ts
/**
 * ラジ株ナビ MCP クライアント
 *
 * Streamable HTTP transport で radikabunavi.com/mcp に接続し、
 * EDINET 財務データツールを呼び出す。
 *
 * 認証: Authorization: Bearer <API_KEY>
 * プロトコル: JSON-RPC 2.0 (MCP Streamable HTTP)
 * セッション管理: mcp-session-id ヘッダー
 */

const MCP_ENDPOINT = 'https://radikabunavi.com/mcp';
const TIMEOUT_MS = 30_000;

interface McpResult {
  content?: Array<{ type: string; text: string }>;
  [key: string]: unknown;
}

interface McpResponse {
  jsonrpc: '2.0';
  result?: McpResult;
  error?: { code: number; message: string };
  id: number | null;
}

export class RadikabuNaviClient {
  private readonly apiKey: string;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error(
        'RADIKABUNAVI_API_KEY is required. Get yours at https://radikabunavi.com/mcp-service',
      );
    }
    this.apiKey = apiKey;
  }

  /**
   * Initialize the MCP session.
   * Must be called before any tool invocation.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const res = await this.rawRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'kabu-dexter', version: '1.0.0' },
    }, 0);

    // Extract session ID from response header
    if (!this.sessionId) {
      throw new Error('MCP server did not return mcp-session-id');
    }

    // Send initialized notification
    await this.rawRequest('notifications/initialized', {}, null);
    this.initialized = true;
  }

  /**
   * Call an MCP tool by name.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.initialize();

    const result = await this.request('tools/call', { name, arguments: args });

    // Extract text content from MCP tool result
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('\n');
    }
    return JSON.stringify(result);
  }

  /**
   * List available MCP tools.
   */
  async listTools(): Promise<unknown[]> {
    await this.initialize();
    const result = await this.request('tools/list', {});
    return (result as unknown as { tools: unknown[] }).tools ?? [];
  }

  // ── Internal ──────────────────────────────────────────────────

  private requestId = 1;

  private async request(method: string, params: Record<string, unknown>): Promise<McpResult> {
    const id = this.requestId++;
    const parsed = await this.rawRequest(method, params, id);

    if (parsed.error) {
      throw new Error(`MCP error ${parsed.error.code}: ${parsed.error.message}`);
    }
    return parsed.result ?? {};
  }

  private async rawRequest(
    method: string,
    params: Record<string, unknown>,
    id: number | null,
  ): Promise<McpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    try {
      const body: Record<string, unknown> = { jsonrpc: '2.0', method, params };
      if (id !== null) body.id = id;

      const response = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Capture session ID
      const sid = response.headers.get('mcp-session-id');
      if (sid) this.sessionId = sid;

      const text = await response.text();

      // Handle SSE format: "event: message\ndata: {...}"
      const jsonMatch = text.match(/^data:\s*(.+)$/m) ?? text.match(/^(\{.+\})$/m);
      if (!jsonMatch) {
        if (id === null) return { jsonrpc: '2.0', result: {}, id: null }; // notification
        throw new Error(`Unexpected MCP response: ${text.slice(0, 200)}`);
      }

      return JSON.parse(jsonMatch[1]) as McpResponse;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `bun test src/tools/finance/__tests__/radikabunavi-client.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/tools/finance/radikabunavi-client.ts src/tools/finance/__tests__/radikabunavi-client.test.ts
git commit -m "feat: add RadikabuNaviClient for MCP connection

Streamable HTTP client for radikabunavi.com/mcp.
Handles session initialization, tool calls, and SSE response parsing."
```

---

## Task 3: ツールレジストリにラジ株ナビ MCP ツールを登録

**Files:**
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/finance/index.ts`

- [ ] **Step 1: `src/tools/finance/index.ts` にラジ株ナビクライアントの export を追加**

```typescript
export { RadikabuNaviClient } from './radikabunavi-client.js';
```

- [ ] **Step 2: `src/tools/registry.ts` を変更**

import セクションに追加:
```typescript
import { RadikabuNaviClient } from './finance/radikabunavi-client.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
```

`EDINETDB_API_KEY` ブロックがあった場所に、以下を追加:

```typescript
// ラジ株ナビ MCP — financials, screener (via EDINET data)
if (process.env.RADIKABUNAVI_API_KEY) {
  try {
    const mcpClient = new RadikabuNaviClient(process.env.RADIKABUNAVI_API_KEY);

    tools.push(
      {
        name: 'get_financials',
        tool: new DynamicStructuredTool({
          name: 'get_financials',
          description: '日本企業の財務データ（売上、利益、ROE等）をEDINETデータから取得します。',
          schema: z.object({
            code: z.string().describe('証券コード（例: "7203"）'),
            metrics: z.array(z.string()).optional().describe('取得する指標名の配列（省略時はデフォルト指標セット）'),
            fiscalYear: z.string().optional().describe('特定の決算期末日（YYYY-MM-DD）。省略時は全年度'),
          }),
          func: async ({ code, metrics, fiscalYear }) => {
            try {
              const args: Record<string, unknown> = { code };
              if (metrics) args.metrics = metrics;
              if (fiscalYear) args.fiscalYear = fiscalYear;
              return await mcpClient.callTool('get_edinet_financial_data', args);
            } catch (error: unknown) {
              return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
        description: `日本企業の財務データ（EDINET有価証券報告書ベース）を取得します。

## When to Use
- 決算データ（売上高、営業利益、純利益等）を確認したいとき
- 財務指標（ROE、ROA、自己資本比率等）が必要なとき
- 過去複数年の推移を分析したいとき

## When NOT to Use
- 株価データが必要なとき（→ get_stock_price）
- テクニカル指標が必要なとき（→ get_technical_indicators）`,
      },
      {
        name: 'get_key_ratios',
        tool: new DynamicStructuredTool({
          name: 'get_key_ratios',
          description: '日本企業の主要財務指標サマリーを取得。',
          schema: z.object({
            code: z.string().describe('証券コード（例: "7203"）'),
          }),
          func: async ({ code }) => {
            try {
              return await mcpClient.callTool('get_edinet_financial_summary', { code });
            } catch (error: unknown) {
              return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
        description: `日本企業の主要財務指標サマリーを取得。

## When to Use
- PER、PBR、ROE等のバリュエーション指標を確認したいとき
- 銘柄の財務概要をざっくり把握したいとき

## When NOT to Use
- 詳細な財務データや推移が必要なとき（→ get_financials）
- 株価データが必要なとき（→ get_stock_price）`,
      },
      {
        name: 'company_screener',
        tool: new DynamicStructuredTool({
          name: 'company_screener',
          description: '日本株スクリーニング。条件を指定して銘柄を絞り込み。',
          schema: z.object({
            conditions: z.array(z.object({
              metric: z.string().describe('指標名（例: roe, operatingMargin, equityRatio）'),
              operator: z.enum(['>=', '<=', '>', '<', '==']).describe('比較演算子'),
              value: z.number().describe('比較値'),
            })).describe('スクリーニング条件の配列（AND条件）'),
            sort: z.object({
              metric: z.string(),
              order: z.enum(['asc', 'desc']),
            }).optional().describe('ソート条件'),
            limit: z.number().optional().describe('返す件数の上限（デフォルト30）'),
            sector: z.string().optional().describe('業種で絞り込み'),
            market: z.string().optional().describe('市場で絞り込み（例: プライム）'),
          }),
          func: async ({ conditions, sort, limit, sector, market }) => {
            try {
              const args: Record<string, unknown> = { conditions };
              if (sort) args.sort = sort;
              if (limit) args.limit = limit;
              if (sector) args.sector = sector;
              if (market) args.market = market;
              return await mcpClient.callTool('screen_stocks', args);
            } catch (error: unknown) {
              return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
            }
          },
        }),
        description: `日本株スクリーニング。約4,000社の財務データから条件検索。

## When to Use
- 特定条件に合う銘柄を探したいとき（例: 「ROE15%以上かつPBR1倍以下」）
- セクター・市場別の銘柄リストが必要なとき
- バリュー株・グロース株のスクリーニング

## When NOT to Use
- 特定銘柄の詳細分析（→ get_financials）
- テクニカル条件でのスクリーニング（→ get_technical_indicators）

## 利用可能な指標例
roe, operatingMargin, equityRatio, salesGrowth, netCash, fcf, dividendPerShare 等108指標`,
      },
    );
  } catch {
    // RadikabuNavi MCP client initialization failed — skip
  }
}
```

- [ ] **Step 3: ビルド確認**

Run: `bunx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/tools/registry.ts src/tools/finance/index.ts
git commit -m "feat: register radikabunavi MCP tools in tool registry

Maps get_financials, get_key_ratios, company_screener to
radikabunavi MCP tools (get_edinet_financial_data,
get_edinet_financial_summary, screen_stocks)."
```

---

## Task 4: 設定・環境変数の更新

**Files:**
- Modify: `src/config/setup.ts`
- Modify: `env.example`

- [ ] **Step 1: `src/config/setup.ts` の EDINET ステータス表示を変更**

L92 の `edinetConfigured` の判定を変更:
```typescript
const edinetConfigured = isSet('RADIKABUNAVI_API_KEY');
```

L114 のステータスメッセージを変更:
```typescript
lines.push(`  ${edinetConfigured ? ok : ng} EDINET財務データ: ${edinetConfigured ? '有効（ラジ株ナビ MCP — 財務・スクリーナー）' : '未設定 -- RADIKABUNAVI_API_KEY を .env に設定してください（https://radikabunavi.com/mcp-service）'}`);
```

- [ ] **Step 2: `env.example` の環境変数を変更**

`EDINETDB_API_KEY` の行を以下に変更:
```bash
RADIKABUNAVI_API_KEY=      # Recommended — Free at https://radikabunavi.com/mcp-service (financials, screener via EDINET data)
```

- [ ] **Step 3: ビルド確認**

Run: `bunx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 4: コミット**

```bash
git add src/config/setup.ts env.example
git commit -m "chore: rename EDINETDB_API_KEY to RADIKABUNAVI_API_KEY

Update startup status display and env.example to reflect
the migration from edinetdb.jp to radikabunavi MCP."
```

---

## Task 5: README・スキル・ドキュメントの更新

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `src/skills/altman-z/SKILL.md`

- [ ] **Step 1: `README.md` を更新**

以下を一括置換・修正:
- データソース: 「EDINET API」→「ラジ株ナビ MCP（EDINETデータ）」
- 前提条件: EDINET API の行を「[ラジ株ナビ MCP](https://radikabunavi.com/mcp-service) APIキー（推奨・無料プランあり）— EDINETベースの財務データ・スクリーナー」に変更
- 環境変数セクション: `EDINETDB_API_KEY` → `RADIKABUNAVI_API_KEY`、URL・説明を更新
- データソースセクション: EDINET API の項目をラジ株ナビ MCP に書き換え
- 環境変数一覧テーブル: 変数名・説明を更新
- 謝辞: `EDINET API` → `ラジ株ナビ MCP` を追加

- [ ] **Step 2: `README.en.md` を更新**

README.md と同じ変更を英語版に適用。

- [ ] **Step 3: `src/skills/altman-z/SKILL.md` のデータソース記述を更新**

「EDINET」への参照を「ラジ株ナビ MCP（EDINETデータ）」に更新。

- [ ] **Step 4: コミット**

```bash
git add README.md README.en.md src/skills/altman-z/SKILL.md
git commit -m "docs: update all references from EDINET to radikabunavi MCP"
```

---

## Task 6: 最終確認とプッシュ

- [ ] **Step 1: 全テスト実行**

Run: `bun test`
Expected: 全 PASS

- [ ] **Step 2: ビルド確認**

Run: `bunx tsc --noEmit`
Expected: エラーなし

- [ ] **Step 3: git status で残りファイルがないか確認**

Run: `git status`
Expected: clean

- [ ] **Step 4: プッシュ**

Run: `git push`
