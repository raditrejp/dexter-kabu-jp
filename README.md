# dexter-kabu-jp

Claude Codeで使える日本株分析AIキット

> GitHub 18,000+ starsの金融AIエージェント [virattt/dexter](https://github.com/virattt/dexter) をベースに、[JPMorgan Python Training](https://github.com/jpmorganchase/python-training) のモンテカルロ法・Altman Z''等の分析手法を導入。Claude Code統合・ラジ株ナビMCP連携・独自分析スキルを追加した日本株対応拡張版です。

「トヨタを分析して」と聞くだけで、DCF・モンテカルロ・Altman Z''・PEGレシオ・ネットネット株判定・CFパターン分析・SEPA・需給分析など15のスキルが全自動で走ります。約3,800社の財務データとスクリーニングに対応。

## 特徴

- **15の分析スキル**: SEPA、ダウ理論、グランビル、需給、DCF、Altman Z''信用リスク、モンテカルロ予測、相関分析、総合分析 等
- **ISQシグナルフレームワーク**: 投資シグナルを5次元（確信度・インパクト・織込度・緊急度・方向性）で定量評価
- **独立Evaluator**: AIが生成した分析をAIが検証。データ充足度・整合性・独自洞察・アクション可能性の4軸で品質保証
- **4つのデータソース**: JQuants API v2 + ラジ株ナビ MCP + TradingView MCP + TDnet MCP
- **永続メモリ**: 過去の分析を記憶し、シグナルの変化を追跡

## Claude Codeで使う（推奨）

Claude Codeをお持ちの場合、最も簡単に使えます。LLM APIキーは不要です。

### セットアップ

```bash
git clone https://github.com/raditrejp/dexter-kabu-jp.git
cd dexter-kabu-jp
claude
```

初回起動時にAIが案内に従ってAPIキーの設定を行います:
1. **JQuants APIキー**（無料プランあり）— 株価データ用
2. **ラジ株ナビ APIキー**（無料プランあり）— 財務データ用

### 使い方

```
> トヨタを分析して
→ DCF + Altman Z'' + PEGレシオ + ネットネット + CFパターン + SEPA + ダウ理論 + グランビル + 需給 + モンテカルロ + 相関を自動実行

> ROE15%以上で配当利回り3%以上の銘柄を探して
→ 約3,800社からスクリーニング

> 7203のDCF分析して
→ 3シナリオ（保守・ベース・楽観）で理論株価を算出
```

## 独立アプリとして使う場合（ターミナル）

Claude Codeを使わず、独立したチャットアプリとして使う場合の手順です。

### 前提条件

- [Bun](https://bun.sh/) (v1.0以上)
- [JQuants API](https://jpx-jquants.com/) アカウント（無料プランから利用可能）
- [ラジ株ナビ MCP](https://radikabunavi.com/mcp-service) APIキー（推奨・無料プランあり）— EDINETベースの財務データ・スクリーナー
- LLM APIキー（OpenAI / Anthropic / Google / Ollama のいずれか1つ）

### インストール

```bash
git clone https://github.com/raditrejp/dexter-kabu-jp.git
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

# ラジ株ナビ MCP（推奨・無料プランあり）— https://radikabunavi.com/mcp-service で登録 → APIキー発行
# 財務データ・スクリーナーに必要。設定しないとこれらの機能は無効になります
RADIKABUNAVI_API_KEY=your-api-key

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

### 定量リスク分析

```
> 7203の倒産リスクは？
→ altman-z スキル: Altman Z'' Scoreで信用リスクを3段階（安全圏/グレーゾーン/危険圏）判定

> トヨタの株価をモンテカルロで予測して
→ monte-carlo スキル: GBMモデルで確率的な株価分布・VaR・目標株価到達確率を算出

> トヨタとTOPIXの相関は？
→ correlation スキル: β値・相関係数・回帰統計・固有リスクを算出
```

### 総合分析（自動）

「分析して」と言うだけで、全スキルを自動で順番に実行します。

```
> 7203を分析して
→ comprehensive-analysis スキル: DCF + Altman Z'' + SEPA + ダウ理論 + グランビル + 需給 + モンテカルロ + 相関を統合。ISQスコアで統一評価

> トヨタとホンダを比較して
→ peer-comparison スキル: PER・PBR・ROE等でセクター内ポジションを比較

> 来週決算の銘柄を教えて
→ earnings-calendar スキル: 決算日・過去サプライズ・ボラティリティ警告
```

### 適時開示

```
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

## データソース

### JQuants API v2（東証公式）

株価・財務・信用残高・投資部門別売買動向等、日本株の基盤データを提供します。

- 公式サイト: https://jpx-jquants.com/

### ラジ株ナビ MCP（EDINETベース）

EDINETデータに基づく財務データ・スクリーナー機能をMCPプロトコル経由で提供します。

- 公式サイト: https://radikabunavi.com/mcp-service
- 環境変数: `RADIKABUNAVI_API_KEY`

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
| **altman-z** | Altman Z'' Score信用リスク分析。財務データから倒産リスクを定量評価（安全圏/グレーゾーン/危険圏） |
| **monte-carlo** | モンテカルロ・シミュレーション。GBMモデルで確率的な株価分布・VaR・目標株価到達確率を算出 |
| **correlation** | 相関分析。銘柄間・対指数の相関係数・β値・回帰統計・固有リスクを算出 |
| **comprehensive-analysis** | 総合銘柄分析。上記全スキルを自動で順次実行し、ISQスコアを統合した総合レポートを出力 |

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
| `RADIKABUNAVI_API_KEY` | 推奨 | ラジ株ナビ MCP APIキー（[無料プランあり](https://radikabunavi.com/mcp-service)）— 財務・スクリーナーに必要 |
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

- [virattt/dexter](https://github.com/virattt/dexter) -- ベースとなったAIリサーチエージェント（GitHub 18,000+ stars）
- [jpmorganchase/python-training](https://github.com/jpmorganchase/python-training) -- モンテカルロ・Altman Z''等の分析手法の参考
- [ラジ株ナビ MCP](https://radikabunavi.com/mcp-service) -- EDINETベースの財務データ・スクリーナー
- [J-Quants](https://jpx-jquants.com/) -- 東証公式株価データ
- [tdnet-disclosure-mcp](https://github.com/ajtgjmdjp/tdnet-disclosure-mcp) -- 適時開示MCPサーバー
