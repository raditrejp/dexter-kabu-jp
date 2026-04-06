# kabu-dexter — 日本株分析AIキット

## 初回セットアップ

このプロジェクトを初めて開いた場合、`.env` ファイルを確認してください。
`.env` が存在しない場合は `env.example` をコピーしてください。

以下のAPIキーが未設定の場合、ユーザーに案内を出して入力を求め、`.env` に保存してください。

### 1. JQuants APIキー（必須・無料プランあり）

- https://jpx-jquants.com/ で無料アカウント作成
- ダッシュボード（https://jpx-jquants.com/ja/dashboard/api-keys）でAPIキーを発行
- 株価データ（日足OHLCV）の取得に使用
- 環境変数名: `JQUANTS_API_KEY`

APIキー取得後、JQuantsのプランを自動判定する。ユーザーには聞かない。以下の順でAPI呼び出しして判定:

1. 1年前の株価データを取得（`GET https://api.jquants.com/v2/equities/bars/daily?code=72030&from={1年前}&to={11ヶ月前}`、ヘッダー `x-api-key`）
   - データが返ってこない → **Free**
   - データが返ってくる → Light以上、次の判定へ
2. 信用残データを取得（`GET https://api.jquants.com/v2/markets/margin-interest?code=72030&from={3ヶ月前}&to={今日}`、ヘッダー `x-api-key`）
   - データが返ってこない → **Light**
   - データが返ってくる → **Standard**以上（Premium判定は不要、Standard扱いで十分）

判定結果を `JQUANTS_PLAN` として `.env` に保存する（free / light / standard）。

### 2. ラジ株ナビ APIキー（必須・無料プランあり）

- https://radikabunavi.com/mcp-service で登録
- APIキーを発行
- 約3,800社のEDINET財務データ・適時開示・大量保有報告書・スクリーニングに使用
- 環境変数名: `RADIKABUNAVI_API_KEY`

両方のキーが `.env` に設定されていることを確認したら、次に `.mcp.json` を確認する。

### 3. MCP設定ファイル（自動生成）

`.mcp.json` が存在しない場合、`.env` の `RADIKABUNAVI_API_KEY` を読み取って自動生成する:

```json
{
  "mcpServers": {
    "radikabunavi": {
      "type": "http",
      "url": "https://radikabunavi.com/mcp",
      "headers": {
        "Authorization": "Bearer {.envから読み取ったRADIKABUNAVI_API_KEY}"
      }
    },
    "tdnet": {
      "type": "stdio",
      "command": "uvx",
      "args": ["tdnet-disclosure-mcp", "serve"]
    }
  }
}
```

**重要:** `${RADIKABUNAVI_API_KEY}` のような変数参照ではなく、**実際のキー値を直接埋め込む**こと。Claude Codeは `.env` を自動読込しないため。

`.mcp.json` を生成したら「MCP設定を作成しました。**新しいセッションを開いてください**（MCPサーバーは起動時に接続されます）。」と伝える。

すべてのセットアップが完了したら、「セットアップ完了です。銘柄コードや企業名を教えてください。」と伝えてください。

---

## 分析スキル

ユーザーが銘柄の分析を求めた場合、以下のルールに従ってください。

### デフォルトの分析

特定のスキルを指定せず「○○を分析して」「○○はどう？」と聞かれた場合:
→ `src/skills/comprehensive-analysis/SKILL.md` を読んでその指示に従う

### 個別スキルの指定

特定の分析手法を指定された場合、対応するスキルファイルを読んで従う:

| ユーザーの指示例 | スキルファイル |
|---------------|-------------|
| 「DCFで分析して」 | `src/skills/dcf/SKILL.md` |
| 「SEPA分析して」 | `src/skills/sepa/SKILL.md` |
| 「ダウ理論で見て」 | `src/skills/dow-theory/SKILL.md` |
| 「グランビルの法則で」 | `src/skills/granville/SKILL.md` |
| 「需給を見て」 | `src/skills/supply-demand/SKILL.md` |
| 「しこり玉分析」 | `src/skills/shikori/SKILL.md` |
| 「倒産リスクは？」 | `src/skills/altman-z/SKILL.md` |
| 「モンテカルロで予測」 | `src/skills/monte-carlo/SKILL.md` |
| 「相関分析して」 | `src/skills/correlation/SKILL.md` |
| 「配当分析して」 | `src/skills/dividend/SKILL.md` |
| 「同業他社と比較して」 | `src/skills/peer-comparison/SKILL.md` |
| 「決算はいつ？」 | `src/skills/earnings-calendar/SKILL.md` |
| 「スクリーニングして」 | `src/skills/screening/SKILL.md` |
| 「レポート出して」「PDF出して」 | `src/skills/pdf-report/SKILL.md` |

### スクリーニング

「高配当株を探して」「ROE15%以上の銘柄」など条件検索の場合:
→ ラジ株ナビMCPの `screen_stocks` ツールを使用

---

## データ取得方法

### 財務・開示データ（ラジ株ナビMCP）

ラジ株ナビMCPサーバーが接続されています。以下のツールが利用可能です:

| ツール | プラン | 内容 |
|--------|--------|------|
| `get_edinet_financial_data` | Free/Pro | 銘柄コード指定で年次財務データ取得（108指標、複数年） |
| `get_edinet_financial_summary` | Free/Pro | 最新年度の主要財務指標サマリー |
| `list_edinet_stocks` | Free/Pro | 利用可能銘柄一覧 |
| `get_timely_disclosures` | Free/Pro | 適時開示（TDnet：決算短信、配当、業績修正等） |
| `get_large_holdings` | Free/Pro | 大量保有報告書 |
| `screen_stocks` | Pro限定 | 条件指定スクリーニング（108指標、AND条件、ソート、業種・市場フィルタ） |

### 株価データ（JQuants API直接呼び出し）

JQuants API v2 を直接呼び出して株価データを取得してください。

**エンドポイント:**
```
GET https://api.jquants.com/v2/equities/bars/daily?code={5桁コード}&from={YYYY-MM-DD}&to={YYYY-MM-DD}
```

**認証:** `x-api-key` ヘッダーに `.env` の `JQUANTS_API_KEY` の値を設定

**銘柄コードの変換:** 4桁コード（例: 7203）は末尾に0を付けて5桁にする（例: 72030）

**レスポンス例:**
```json
{
  "data": [
    {
      "Date": "2026-03-28",
      "Code": "72030",
      "AdjO": 2500.0,
      "AdjH": 2550.0,
      "AdjL": 2480.0,
      "AdjC": 2530.0,
      "AdjVo": 15000000
    }
  ]
}
```

**フィールド:** AdjO=調整済始値, AdjH=調整済高値, AdjL=調整済安値, AdjC=調整済終値, AdjVo=調整済出来高

**制限:** Freeプランは直近12週分のデータのみ取得可能

---

## 独立アプリとして使う場合

`bun start` で独立したチャットアプリとしても起動できます。この場合はLLM APIキー（OpenAI/Anthropic/Google等）も必要です。
