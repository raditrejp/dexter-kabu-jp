# dexter-kabu-jp

日本株の自律型リサーチAIエージェント

> [virattt/dexter](https://github.com/virattt/dexter) をベースに、日本株専用の分析環境を構築したフォーク版です。

複雑な投資リサーチを自動で分解・実行・検証します。銘柄コードを渡すだけで、ファンダメンタル・テクニカル・需給の多角的な分析レポートを生成します。

## 特徴

- **11の分析スキル**: SEPA、ダウ理論、グランビルの法則、需給分析、しこり玉、DCF、スクリーニング等
- **ISQシグナルフレームワーク**: 投資シグナルを5次元（確信度・インパクト・織込度・緊急度・方向性）で定量評価
- **独立Evaluator**: AIが生成した分析をAIが検証。データ充足度・整合性・独自洞察・アクション可能性の4軸で品質保証
- **4つのデータソース**: JQuants API v2 + EDINET DB + TradingView MCP + TDnet MCP
- **永続メモリ**: 過去の分析を記憶し、シグナルの変化を追跡

## クイックスタート

### 前提条件

- [Bun](https://bun.sh/) (v1.0以上)
- [JQuants API](https://jpx-jquants.com/) アカウント（無料プランから利用可能）
- LLM APIキー（OpenAI / Anthropic / Google / Ollama のいずれか1つ）

### インストール

```bash
git clone https://github.com/your-username/dexter-kabu-jp.git
cd dexter-kabu-jp
bun install
```

### 環境変数の設定

```bash
cp env.example .env
```

`.env` を開き、最低限以下を設定してください:

```bash
# JQuants（必須）— https://jpx-jquants.com/ で無料登録 → ダッシュボードでAPIキー発行
JQUANTS_API_KEY=your-api-key

# EDINET DB（推奨・無料）— https://edinetdb.jp/developers でGoogleログイン → 即時発行
# 財務データ・有報・スクリーナーに必要。設定しないとこれらの機能は無効になります
EDINETDB_API_KEY=your-api-key

# LLM APIキー（いずれか1つ）
OPENAI_API_KEY=sk-...
# または
ANTHROPIC_API_KEY=sk-ant-...
```

### 起動

```bash
bun start
```

開発モード（ファイル変更で自動リロード）:

```bash
bun dev
```

## 使い方

起動するとチャットUIが立ち上がります。日本語で質問するだけでAIが適切なツールとスキルを自動選択します。

### 基本的な使い方

```
> 7203の株価を見て
→ get_stock_price で直近60日の日足データを取得

> トヨタの財務を見て
→ get_financials で売上・利益・ROE等の財務指標を取得

> 7203のPER・PBR・ROEは？
→ get_key_ratios でバリュエーション指標を取得
```

### スキルを使った分析

銘柄コードや会社名を伝えると、AIが分析内容に応じてスキルを自動起動します。

```
> 7203をSEPA分析して
→ sepa スキル: ミネルヴィニの7条件チェック + ステージ分類

> 三菱UFJの需給を見て
→ supply-demand スキル: 信用倍率・空売り比率・投資部門別売買

> 6758のDCFで理論株価を出して
→ dcf スキル: 3シナリオ（保守・ベース・楽観）で算出

> 半導体関連でスクリーニングして
→ screening スキル: オニール × ミネルヴィニ × ダウ理論 × グランビル × 需給
```

### 複合的な分析

複数の視点を組み合わせた質問にも対応します。

```
> 7203を分析して
→ 株価 + 財務 + テクニカル + 需給を総合的に分析。ISQスコアで統一評価

> トヨタとホンダを比較して
→ peer-comparison スキル: PER・PBR・ROE等でセクター内ポジションを比較

> 来週決算の銘柄を教えて
→ earnings-calendar スキル: 決算日・過去サプライズ・ボラティリティ警告
```

### 有報・開示情報

```
> 7203の有報からリスク要因を読んで
→ read_filings: 有価証券報告書のテキストを抽出して分析

> トヨタの最新の適時開示は？
→ get_disclosures: TDnetから決算短信・業績修正等を検索
```

### メモリ（記憶）

Dexterは過去の分析を記憶します。同じ銘柄を再度分析すると、前回からのシグナル変化を追跡して表示します。

```
> 前回7203を分析したときと何が変わった？
→ メモリから前回のISQスコアを取得し、変化を比較
```

> **ヒント**: 自然な日本語で話しかけてください。「〜を見て」「〜を教えて」「〜を分析して」のような表現で十分です。

## JQuants プラン別機能比較

JQuantsの契約プランによって利用可能なデータ範囲が異なります。

| 機能 | Free | Light | Standard | Premium |
|------|:----:|:-----:|:--------:|:-------:|
| 株価データ（日足） | 直近12週 | 直近2年 | 全期間 | 全期間 |
| 財務データ | 直近2年 | 直近5年 | 全期間 | 全期間 |
| 信用残高 | - | - | 全期間 | 全期間 |
| 投資部門別売買動向 | - | - | 全期間 | 全期間 |
| 空売り比率 | - | - | - | 全期間 |
| リアルタイム株価 | - | - | - | 20分遅延 |

> **おすすめ**: まずは無料プランで試して、需給分析も使いたくなったらStandardプランへ。

`.env` でプランを指定すると、利用不可なスキルが自動で制限されます:

```bash
JQUANTS_PLAN=free  # free | light | standard | premium
```

## データソース

### JQuants API v2（東証公式）

株価・財務・信用残高・投資部門別売買動向等、日本株の基盤データを提供します。

- 公式サイト: https://jpx-jquants.com/

### EDINET DB

有価証券報告書・四半期報告書のXBRLデータを構造化して提供するサービスです。

- 公式サイト: https://edinetdb.jp/
- 環境変数: `EDINETDB_API_KEY`

### TradingView MCP

TradingViewからテクニカル指標（RSI, MACD, ボリンジャーバンド等）をMCPプロトコル経由で取得します。

### TDnet MCP（適時開示）

東証TDnetの適時開示情報をMCPプロトコル経由で取得します。決算短信・業績修正・IR情報を自動で検索できます。

- 参考実装: https://github.com/ajtgjmdjp/tdnet-disclosure-mcp

## 利用可能なスキル

| スキル | 説明 |
|--------|------|
| **screening** | オニール x ミネルヴィニ x ダウ理論 x グランビル x 需給の全部盛りスクリーニング |
| **sepa** | ミネルヴィニSEPA条件チェック（7項目）とステージ分類（S1〜S4） |
| **dow-theory** | ダウ理論に基づくトレンド判定。スイングハイ・ローの切り上げ/切り下げを検出 |
| **granville** | グランビルの法則。株価とMAの位置関係から8パターンの売買シグナルを判定 |
| **supply-demand** | 需給分析。信用倍率・空売り比率・投資部門別売買動向を総合判定 |
| **shikori** | しこり玉分析。価格帯別出来高+信用残から含み損ポジションの消化状況を判定 |
| **dcf** | DCFバリュエーション。フリーキャッシュフローから理論株価を3シナリオで算出 |
| **dividend** | 配当分析。利回り推移・連続増配年数・DOE・配当性向から持続性を評価 |
| **peer-comparison** | 同業他社比較。PER・PBR・ROE・ROIC等でセクター内ポジションを表示 |
| **earnings-calendar** | 決算カレンダー。次回決算日・過去のサプライズ履歴・ボラティリティ警告 |
| **x-research** | X/Twitter市場センチメント調査。リアルタイムの投資家心理を把握 |

## ISQシグナルフレームワーク

投資シグナルの質を5つの次元で定量評価する独自フレームワークです。

| 次元 | 説明 | 範囲 |
|------|------|------|
| **Sentiment（方向性）** | 強気か弱気か | -1.0 〜 +1.0 |
| **Confidence（確信度）** | データの裏付けがあるか | 0.0 〜 1.0 |
| **Intensity（インパクト）** | シグナルの強さ | 1 〜 5 |
| **Expectation Gap（織込度）** | 市場が織り込んでいない度合い | 0.0 〜 1.0 |
| **Timeliness（緊急度）** | 時間的な緊急性 | 0.0 〜 1.0 |

各スキルの分析結果はISQスコアに変換され、スキル横断で比較可能な統一指標として機能します。

## 独立Evaluator

分析品質を自動で検証する仕組みです。メインのAIとは別のLLMコンテキストで動作し、以下の4軸で評価します:

| 評価軸 | 内容 |
|--------|------|
| **Data Sufficiency（データ充足度）** | 判断に十分なデータがあるか |
| **Consistency（整合性）** | 分析内容に矛盾がないか |
| **Insight（独自洞察）** | 表面的でない深い分析があるか |
| **Actionability（行動可能性）** | 具体的な行動に結びつくか |

各軸1〜5点、平均3.0点以上で合格。不合格の場合はフィードバックを返して再分析を促します。

## 投資哲学

本ツールの分析フレームワークは以下の投資哲学に基づいています:

- **ウォーレン・バフェット / チャーリー・マンガー**: 内在価値・安全余裕・経済的堀
- **マーク・ミネルヴィニ**: SEPA（Specific Entry Point Analysis）・ステージ分析
- **ウィリアム・オニール**: CAN-SLIM・相対的強度
- **ダウ理論**: トレンドの方向性と確認
- **グランビルの法則**: 移動平均線と株価の位置関係

> **注意**: 本ツールは投資助言を行うものではありません。最終的な投資判断はご自身の責任でお願いします。

## 環境変数一覧

| 変数名 | 必須 | 説明 |
|--------|:----:|------|
| `JQUANTS_API_KEY` | 必須 | JQuants APIキー（[ダッシュボード](https://jpx-jquants.com/ja/dashboard/api-keys)で発行） |
| `JQUANTS_PLAN` | - | JQuantsプラン (`free`/`light`/`standard`/`premium`)。デフォルト: `free` |
| `EDINETDB_API_KEY` | 推奨 | EDINET DB APIキー（[無料発行](https://edinetdb.jp/developers)）— 財務・有報・スクリーナーに必要 |
| `OPENAI_API_KEY` | *1 | OpenAI APIキー |
| `ANTHROPIC_API_KEY` | *1 | Anthropic APIキー |
| `GOOGLE_API_KEY` | *1 | Google AI APIキー |
| `OLLAMA_BASE_URL` | *1 | OllamaのベースURL（ローカルLLM） |
| `EXASEARCH_API_KEY` | - | Exa Web検索APIキー |
| `PERPLEXITY_API_KEY` | - | Perplexity APIキー |
| `TAVILY_API_KEY` | - | Tavily Web検索APIキー |
| `X_BEARER_TOKEN` | - | X/Twitter APIキー（センチメント調査用） |

> *1: LLM APIキーは最低1つ必要です。

## ライセンス

MIT License. Originally forked from [virattt/dexter](https://github.com/virattt/dexter).

## 謝辞

- [virattt/dexter](https://github.com/virattt/dexter) -- ベースとなったAIリサーチエージェント
- [edinetdb/dexter-jp](https://github.com/edinetdb/dexter-jp) -- 日本株対応の参考実装
- [EDINET DB](https://edinetdb.jp/) -- 有価証券報告書データ
- [J-Quants](https://jpx-jquants.com/) -- 東証公式株価データ
- [tdnet-disclosure-mcp](https://github.com/ajtgjmdjp/tdnet-disclosure-mcp) -- 適時開示MCPサーバー
