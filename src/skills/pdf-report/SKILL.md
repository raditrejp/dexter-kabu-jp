---
name: pdf-report
description: 銘柄コード指定のみで、フル分析→ビジュアルPDFレポート出力まで1コマンドで完結する。レーダーチャートと横棒グラフで8軸スコアを可視化し、初心者にもわかりやすい形式で提供。「レポート出して」「PDF出して」「レポートにして」のように求められたときに使用。
---

# PDFレポート出力 Skill

銘柄コード指定のみで、CLIスクリプトによるデータ取得→スコア算出、Claude Codeによるコメント生成、CLIによるPDF生成の3ステップで完結する。

## 前提条件

- `.env`に`RADIKABUNAVI_API_KEY`が設定されていること（必須）
- `.env`に`JQUANTS_API_KEY`が設定されていること（推奨。なければ6軸で続行）
- Playwrightがインストールされていること（`bunx playwright install chromium`）

## Workflow

ユーザーが「レポート出して {銘柄コード}」と言ったら、以下の3ステップを実行する。

### Step 1: データ取得 + スコア算出（CLI）

以下のコマンドを実行する:

```bash
bun run src/skills/pdf-report/cli.ts {銘柄コード}
```

これにより以下が自動実行される（約7秒）:
- ラジ株ナビMCPから財務データ取得
- JQuants APIから株価データ・信用残取得（プランに応じて）
- AnalysisInput構築 + テクニカル/需給データ計算
- 8軸スコア算出

結果は `output/{code}_data.json` に保存され、stdoutにもJSONが出力される。

### Step 2: コメント生成（Claude Code自身）

Step 1のJSON出力を読み、以下のJSON構造を生成する。

**重要:** コメントJSONの内容はユーザーに表示しないこと。Bashツールで `cat << 'EOF' > output/{code}_comments.json` を使って直接ファイルに書き込む。Writeツールは使わない（内容が画面に表示されてしまうため）。

ファイル形式:

```json
{
  "details": {
    "valuation": "各軸の根拠テキスト（2〜4文）",
    "profitability": "...",
    "growth": "...",
    "safety": "...",
    "trend": "...",
    "supplyDemand": "...",
    "shareholderReturn": "...",
    "moat": "..."
  },
  "summary": "総合サマリー（3〜5文）",
  "risks": [
    { "title": "リスク名", "description": "説明" }
  ]
}
```

**コメント生成ルール:**
- **移動平均線の具体的な数値（SMA50: ○○円等）は記載しない。** 判定結果と解釈のみ
- 数値は絶対的な基準値と比較する形で記載（例: 「ROE 13.3%は一般的な優良水準10%を上回る」）
- **株価依存の指標は決算時と現在の両方を記載する**（scoresCurrent がある場合）
  - 割安度: 「PER 7.3倍（決算時）→ 9.1倍（現在）」
  - 還元力: 「配当利回り3.4%（決算時）→ 2.8%（現在）」
- 株価非依存の指標（稼ぐ力・成長性・安全性・事業独占力）は決算時の値のみ
- SEPAステージの意味を日本語で解説（S1=底固め期、S2=上昇期、S3=天井形成期、S4=下落期）
- 初心者にもわかりやすい表現を使う
- hasJQuantsがfalse（Freeプラン）の場合、trend/supplyDemandには「JQuants Light/Standardプラン以上で利用可能」と記載
- リスク要因は2〜4件

### Step 3: PDF生成（CLI）

```bash
bun run src/skills/pdf-report/cli.ts {銘柄コード} --comments-json output/{code}_comments.json
```

結果: `output/{code}_report_{YYYY-MM-DD}.pdf` にPDFが出力される。

PDF生成後、`open output/{code}_report_{YYYY-MM-DD}.pdf` で自動的に開く。

## エラーハンドリング

| エラー | 対応 |
|-------|------|
| ラジ株ナビAPIキー未設定 | 「.envにRADIKABUNAVI_API_KEYを設定してください」と案内して終了 |
| 銘柄コードが見つからない | 「銘柄コード{code}のデータが見つかりませんでした」と案内して終了 |
| JQuants APIキー未設定 | Freeプラン相当（6軸）で続行。株価チャートなし |
| Playwright未インストール | 「`bunx playwright install chromium`を実行してください」と案内して終了 |

## 8軸スコア

| 軸 | 内容 |
|---|---|
| 割安度 | DCF乖離率・EV/EBITDA・PER・PBR・ネットネット |
| 稼ぐ力 | ROE・営業利益率・EBITDAマージン・従業員あたり営業利益・ROA |
| 成長性 | 売上CAGR 3年/5年・EPS成長率・PEG・設備投資比率 |
| 安全性 | Altman Z''・Net Debt/EBITDA・自己資本比率・D/Eレシオ・営業CF対有利子負債 |
| トレンド | SEPA・ダウ理論・グランビル |
| 需給 | 信用倍率・出来高・モンテカルロ |
| 還元力 | 配当利回り・増配率・配当性向・DOE・自社株買い・総還元性向 |
| 事業独占力 | 営業利益率/ROE/FCFマージンの安定性（10年σ）・営業利益率水準・SGA比率安定性 |

## デザイン

- デジタル庁ダッシュボードガイド準拠
- 参考: https://www.digital.go.jp/resources/dashboard-guidebook
- 閾値・ウェイト詳細: `docs/specs/2026-04-04-pdf-report-design.md`
