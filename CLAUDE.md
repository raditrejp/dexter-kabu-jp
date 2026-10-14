# kabu-dexter — 日本株分析AIキット

## セッション開始時の処理

セッションが開始されたら、以下を**順番に**実行する:

### 1. アップデートチェック

`git fetch origin main --quiet` を実行し、`git log HEAD..origin/main --oneline` でリモートとの差分を確認する。

- **差分がある場合（未取得のコミットがある）:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔔 アップデートがあります
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{git logから取得した更新内容を日本語で要約、箇条書き}

「git pull」で更新できます。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- **差分がない場合:** 何も表示しない（最新版）

### 2. 初回セットアップ確認

以下のセットアップ確認に進む。すでにセットアップ済みならスキップしてメインメニュー表示へ。

---

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

1. 直近1週間の株価データを取得（`GET https://api.jquants.com/v2/equities/bars/daily?code=72030&from={1週間前}&to={今日}`、ヘッダー `x-api-key`）
   - データが空（Freeは12週遅延で直近データ取得不可） → **Free**
   - データが返ってくる → Light以上、次の判定へ
2. 信用残データを取得（`GET https://api.jquants.com/v2/markets/margin-interest?code=72030&from={3ヶ月前}&to={今日}`、ヘッダー `x-api-key`）
   - データが返ってこない → **Light**
   - データが返ってくる → **Standard**以上（Premium判定は不要、Standard扱いで十分）

判定結果を `JQUANTS_PLAN` として `.env` に保存する（free / light / standard）。

### 2. ラジ株ナビ APIキー（必須・無料プランあり）

- https://radikabunavi.com/mcp-service で登録
- APIキーを発行
- 約3,700社のEDINET財務データ・適時開示・大量保有報告書・スクリーニングに使用
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

すべてのセットアップが完了したら、下記のメインメニューを表示してください。

---

## メインメニュー

セッション開始時（セットアップ完了後）、または「メニュー」「ヘルプ」と言われた場合に以下を表示する:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 kabu-dexter メニュー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【銘柄分析】
  1. 総合分析　　　　— 「{コード/銘柄名}を分析して」
  2. DCF分析　　　　— 「{コード/銘柄名}をDCFで分析して」
  3. SEPA分析　　　　— 「{コード/銘柄名}をSEPA分析して」
  4. 配当分析　　　　— 「{コード/銘柄名}の配当分析して」
  5. 倒産リスク　　　— 「{コード/銘柄名}の倒産リスクは？」
  6. モンテカルロ　　— 「{コード/銘柄名}をモンテカルロで予測」

【テクニカル分析】
  7. ダウ理論　　　　— 「{コード/銘柄名}をダウ理論で見て」
  8. グランビル　　　— 「{コード/銘柄名}をグランビルの法則で」
  9. 需給分析　　　　— 「{コード/銘柄名}の需給を見て」
 10. しこり玉　　　　— 「{コード/銘柄名}のしこり玉分析」

【スクリーニング・比較】
 11. スクリーニング　— 「スクリーニングして」
 12. 同業他社比較　　— 「同業他社と比較して」
 13. 相関分析　　　　— 「相関分析して」

【レポート・設定】
 14. PDFレポート　　 — 「{コード}のレポート出して」
 15. スクリーニング マイセット管理 — 「マイセット追加して」

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
銘柄コード・企業名、または番号で選択してください。
```

番号で選択された場合は、対応するスキルの説明を簡潔に案内し、必要な情報（銘柄コードなど）を聞く。

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
| 「スクリーニングして」 | `src/skills/screening/SKILL.md` |
| 「{コード}のレポート出して」 | `src/skills/pdf-report/SKILL.md` |

### スクリーニング

「スクリーニングして」「銘柄探して」「高配当株を探して」など:
→ `src/skills/screening/SKILL.md` を読んでプリセット選択式フローに従う

### マイセット管理

「マイセット追加して」「マイセット作りたい」:
→ `src/skills/screening/SKILL.md` のプリセット管理セクションに従い、`src/skills/screening/presets/user/` にYAML保存

「マイセット編集して」「マイセット削除して」:
→ ユーザープリセット（`src/skills/screening/presets/user/`）のみ編集・削除可能

---

## データ取得方法

### 財務・開示データ（ラジ株ナビMCP）

ラジ株ナビMCPサーバーが接続されています。以下のツールが利用可能です（約3,700社のEDINET有報ベース。全プランで使えます。無料・ライト・スタンダード・プロの4プランで違うのは1日の利用上限と、四半期データ等の一部機能です）。

| ツール | 内容 |
|--------|------|
| `get_edinet_financial_data` | 銘柄コード指定で年次財務データ取得（複数年。`metrics`・`fiscalYear`・`excludeForecast` 等で絞れる）。最新年度の PER・PBR・ROE・配当利回りもここから取る |
| `get_stock_analysis` | 銘柄の総合分析（財務・理想株価・6軸スコア・DCF・業種比較・会社予想を1回で返す。返したセクション数ぶん利用回数を使う） |
| `get_ideal_price` / `get_stock_score` / `get_dcf_valuation` | 理想株価・6軸スコア・DCF |
| `get_industry_benchmark` | 業種の中央値・四分位・業種内順位 |
| `get_earnings_forecast` / `get_earnings_flash` | 会社業績予想・決算速報（四半期（q1/q2/q3）はライト以上） |
| `get_timely_disclosures` | 適時開示（TDnet：決算短信、配当、業績修正等。`category` で絞れる） |
| `get_large_holdings` / `get_major_shareholders_history` / `get_investor_portfolio` | 大量保有報告書・大株主の推移・投資家の保有銘柄 |
| `get_main_customers` | 有報の主要な販売先（売上高10%以上）の順引き・逆引き |
| `search_stocks` | 会社名・証券コードの検索（`sector`・`market` が返る） |
| `screen_stocks` | 条件指定スクリーニング（AND条件、ソート、業種・市場フィルタ。応答は `{ metricLabels, results }`） |
| `screen_by_framework` | 定型の投資フレーム（バリュー・成長・高配当・業績回復）で探す |
| `list_edinet_stocks` | カバレッジの説明文だけ（銘柄一覧ではない。銘柄の業種・市場は `search_stocks` で取る） |
| `add_to_watchlist` / `get_watchlist` / `remove_from_watchlist` / `update_watchlist_note` / `report_issue` | 監視リスト・データ誤りの報告（API キー・OAuth 認証時のみ） |

※ このリポジトリのツール（`registry.ts`）が直接つなぐのは `get_financials`（`get_edinet_financial_data`）・`get_key_ratios`（同じく `get_edinet_financial_data` から最新年度の指標を取り出す）・`get_stock_analysis`（総合分析。`code`・任意の `currentPrice`。回数不足で返さなかったセクションがあれば `userNotice` を付けて返す）・`company_screener`（`screen_stocks`）の4つ。それ以外はスキルや Claude Code の MCP 接続から直接呼ぶ。`get_edinet_financial_summary` は廃止済み。
※ 一覧は `https://radikabunavi.com/.well-known/mcp/server-card.json` で確認できる。

**データの性質:** ラジ株ナビが返す価格・PER・PBR・配当利回りは、有報の決算時点の値（決算時の擬似株価 = PER×EPS ベース）で、市場の現在値ではない。「現在株価」として表示しないこと。現在株価の分析は利用者自身の JQuants キーで行う。

**利用回数と制限（`tools/call` だけ数える。`initialize`・`tools/list` は数えない）:**

- 1日の上限: 無料 100 / ライト 250 / スタンダード 1,000 / プロ 2,000（日本時間の0時にリセット）
- 複数件を返すツールは返した件数ぶん数える（`get_earnings_flash`・`get_watchlist`・`get_industry_benchmark`・`get_stock_analysis`（最大6））
  - `get_stock_analysis` は返したセクション数ぶん（最大6）。残りが足りないときは足りる分だけ返し、返さなかったものは `usage.withheld` に挙がる（利用者に必ず伝える）。データが無く理由だけのセクションと、上場廃止・REIT・ETF 等（分析せず理由を返す）は数えない
  - 「分析して」では `comprehensive-analysis` スキルがまず `get_stock_analysis` を1回呼び、足りない情報だけ個別ツールで補う
- 連打制限: ツール実行は 10回/秒・60回/分、接続の手続き（`initialize` 等）は 30回/秒・300回/分。超えるとツール実行は `isError` の案内文、手続きは HTTP 429 で返る。複数ツールを同時に呼ぶときは 10回/秒を超えないようにする
- 上限到達・連打制限・引数エラーは HTTP 200 のまま `isError: true` で返る（`RadikabuNaviClient` は Error にして案内文をそのまま見せる）。上限の80%に達した日は成功結果に案内文の text が1件追加されるので、JSON を読むときは最初の text だけを使う（`callToolData`）

**接続方法:** `https://radikabunavi.com/mcp` に Streamable HTTP で直接つなぐ（`mcp-remote` は不要）。サーバーはステートレスで `mcp-session-id` を返さない。認証は API キー（`Authorization: Bearer rk_...`）か、対応クライアントでの OAuth。手順は https://radikabunavi.com/mcp-claude-guide

### 株価データ（JQuants API直接呼び出し）

JQuants API v2 を直接呼び出して株価データを取得してください。

**エンドポイント:**
```
GET https://api.jquants.com/v2/equities/bars/daily?code={5桁コード}&from={YYYY-MM-DD}&to={YYYY-MM-DD}
```

**認証:** `x-api-key` ヘッダーに `.env` の `JQUANTS_API_KEY` の値を設定

**銘柄コードの変換:** 4桁コード（例: 7203）は末尾に0を付けて5桁にする（例: 72030）

#### ⚠️ 株式分割の扱い — 必ず Adj 系を使うこと

レスポンスには **「生値 (O/H/L/C/Vo)」と「分割調整済み (AdjO/AdjH/AdjL/AdjC/AdjVo)」の両方が含まれる**。**必ず Adj 系のフィールドを使うこと。**

生値 O/H/L/C は**株式分割を反映していない**ため、分割を跨ぐ期間でテクニカル分析や乖離率計算をすると致命的に狂う。

**実例（トヨタ 7203、2021-09-29 に 1→5 株分割）:**

| Date | C（生値） | AdjC（調整済み） |
|---|---|---|
| 2021-09-28 | **10,385円** | 2,077円 |
| 2021-09-29（分割当日） | 2,073円 | 2,073円 |
| 2021-09-30 | 2,000円 | 2,000円 |

→ 生値 C を使うと「9/28→9/30 で 10,385→2,000 円の-80%大暴落」と誤検出する。AdjC なら 2,077→2,000 円で連続。

**レスポンス例（実際の構造）:**
```json
{
  "data": [
    {
      "Date": "2026-03-28",
      "Code": "72030",
      "O": 2500.0, "H": 2550.0, "L": 2480.0, "C": 2530.0, "Vo": 15000000,
      "AdjFactor": 1.0,
      "AdjO": 2500.0, "AdjH": 2550.0, "AdjL": 2480.0, "AdjC": 2530.0, "AdjVo": 15000000
    }
  ]
}
```

**使用するフィールド:**
- `AdjO`=調整済始値, `AdjH`=調整済高値, `AdjL`=調整済安値, `AdjC`=調整済終値, `AdjVo`=調整済出来高
- `AdjFactor` は分割の検出用（1.0 以外 = その日に分割発生）

**使ってはいけないフィールド:**
- `O` / `H` / `L` / `C` / `Vo`（生値・分割未調整）
- `M*` / `MAdj*`（前場のみ）、`A*` / `AAdj*`（後場のみ）— 通常分析では使わない

**制限:** Freeプランは直近12週分のデータのみ取得可能

---

## 独立アプリとして使う場合

`bun start` で独立したチャットアプリとしても起動できます。この場合はLLM APIキー（OpenAI/Anthropic/Google等）も必要です。
