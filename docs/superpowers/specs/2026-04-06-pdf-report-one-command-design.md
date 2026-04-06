# PDF Report One-Command Design

銘柄コード指定のみで、データ取得→全Phase分析→スコア計算→コメント生成→PDF出力まで一気通貫で実行する。

## 背景

現状のpdf-reportスキルは「総合分析が完了していること」が前提。ユーザーは先にcomprehensive-analysisを実行し、その結果を手動でPDFスキルに渡す2ステップ構成になっている。

これを「レポート出して 7203」の1コマンドで完結させる。

## 方針

- **SKILL.mdワークフロー方式**: 新規TSコードは書かない。SKILL.mdにフルワークフローを記述し、Claude Codeが既存パーツを順次呼び出す
- **comprehensive-analysisと同等**: Phase 1〜6を全て実行する（データ不足時はスキップ）
- **コメント生成はClaude Code自身**: Claude APIは使わない。VSCode/ターミナルのClaude Code上で使う前提

## 変更対象

| ファイル | 変更内容 |
|---------|---------|
| `src/skills/pdf-report/SKILL.md` | ワークフローを全面書き換え。1コマンド完結のフロー記述 |
| `src/skills/comprehensive-analysis/SKILL.md` | 変更なし（Phase 8の「PDFも出しますか？」は維持） |

新規ファイルなし。既存TSコード（data-builder.ts, scores.ts, technical.ts, supply-demand.ts, generate.ts）は変更なし。

## ワークフロー詳細

### Step 0: 銘柄コード受け取り + 環境確認

- 銘柄コード（4桁 or 5桁）を受け取る
- `.env`からJQUANTS_API_KEY、RADIKABUNAVI_API_KEYの存在を確認
- JQuantsプランを判定（JQUANTS_PLAN環境変数、デフォルトfree）

### Step 1: 基本情報 + 財務データ取得（ラジ株ナビMCP）

- `get_edinet_financial_data` で年次財務データ取得
- `get_edinet_financial_summary` で最新年度サマリー取得
- 銘柄名、セクター、業種、市場を確認

### Step 2: 株価データ取得（JQuants API）— Light以上のみ

- Freeプランの場合はスキップ（12週=約60日ではSMA200算出不可、テクニカル分析が不完全なため）
- Light以上: JQuants API v2 `equities/bars/daily` で日足OHLCV取得（260日+）
- `technical.ts`の`analyzeTechnical()`でSEPA/ダウ理論/グランビル/出来高比率を計算
- SMA50/SMA200をpriceDataに付与
- **現在株価**: JQuantsの最新終値を使用。Freeプランの場合はラジ株ナビ`get_edinet_financial_summary`の株価情報から取得（決算時株価のみ）

### Step 3: 信用残取得（JQuants API、Standardプラン以上）

- `supply-demand.ts`の`fetchSupplyDemandData()`で信用残取得
- Standardプラン未満の場合はスキップ（デフォルト値で処理）

### Step 4: comprehensive-analysis各Phase実行（コメント材料収集）

各Phaseのスキルを`skill`ツールで順次呼び出す。**スキル呼び出しの目的はコメント生成の材料収集であり、スコア計算には使わない。** スコア計算はStep 5〜7でTS関数の出力のみを使う。

| Phase | スキル | 目的（コメント材料） | スキップ条件 |
|-------|--------|-------------------|------------|
| 1a | dcf | 理論株価・割安/割高の根拠テキスト | - |
| 1b | peer-comparison | 同業他社比較の文脈 | - |
| 1c | dividend | 配当の評価コメント | 無配銘柄 |
| 2 | altman-z | 倒産リスク評価テキスト | 金融業 |
| 3a | sepa | ステージ解説テキスト | Freeプラン |
| 3b | dow-theory | トレンド判定テキスト | Freeプラン |
| 3c | granville | シグナル解説テキスト | Freeプラン |
| 4a | supply-demand | 需給評価テキスト | Standardプラン未満 |
| 4b | shikori | しこり玉解説テキスト | Freeプラン |
| 5 | monte-carlo | 確率予測テキスト + 上昇確率（Step 6で使用） | Freeプラン |
| 6 | correlation | 相関分析テキスト | Freeプラン |

Phase 1d（PEG）と1e（ネットネット）はインライン計算のため別スキル呼び出し不要。`data-builder.ts`が自動算出する。

**優先順位（ツール呼び出し上限に近い場合）:**
1. Phase 1（ファンダメンタル）
2. Phase 3（テクニカル）
3. Phase 4（需給）
4. Phase 2（信用リスク）
5. Phase 5（モンテカルロ）
6. Phase 6（相関）

### Step 5: AnalysisInput構築

- `data-builder.ts`の`buildAnalysisInput()`でラジ株ナビ財務データからAnalysisInputを構築
- `useCurrentPrice: false`（決算時株価ベース）でスコア計算
- Light以上の場合、`useCurrentPrice: true`でも2回目のスコア計算（2段表示用）

### Step 6: テクニカル/需給データで上書き

- Step 2で計算したTechnicalResultで`analysisInput.technical`を上書き
- Step 3で取得したSupplyDemandDataで`analysisInput.supplyDemand`を上書き
- モンテカルロ上昇確率はStep 4のPhase 5結果から取得

### Step 7: 8軸スコア算出

- `scores.ts`の`calculateAllScores()`でEightAxisScores算出
- 基準値は全軸50固定

### Step 8: コメント生成（Claude Code自身）

Claude Codeが各軸の分析結果を見て、以下を生成:

1. **各軸の根拠テキスト（8本）** — details[key]に入る
2. **総合サマリー（1本）** — summary
3. **リスク要因（2〜4件）** — risks[]

コメント生成ルール（既存SKILL.mdのガイドに従う）:
- SMAの具体数値は書かない
- 数値は絶対基準と比較（例: 「ROE 13.3%は優良水準10%を上回る」）
- 株価依存指標は決算時→現在の2段表示（Light以上）
- SEPAステージの意味を日本語で解説
- 初心者にもわかりやすい表現

### Step 9: ReportInput組み立て → PDF生成

- Step 1〜8の結果からReportInputを構築
- `generate.ts`の`generateReport()`でPDF出力
- 出力先: `output/{code}_report_{date}.pdf`

### Step 10: 完了報告

- PDFの出力パスをユーザーに伝える
- 「PDFレポートを出力しました: output/7203_report_2026-04-06.pdf」

## プラン別の挙動

| JQuantsプラン | 利用可能な軸 | 株価チャート | 2段表示 |
|-------------|-----------|-----------|--------|
| Free | 6軸（トレンド・需給なし） | なし | なし（決算時のみ） |
| Light | 7軸（トレンド追加） | あり | あり（決算時→現在） |
| Standard+ | 8軸（需給追加） | あり | あり |

## エラーハンドリング

| エラー | 対応 |
|-------|------|
| ラジ株ナビAPIキー未設定 | 「.envにRADIKABUNAVI_API_KEYを設定してください」と案内して終了 |
| 銘柄コードが見つからない | 「銘柄コード{code}のデータが見つかりませんでした」と案内して終了 |
| JQuants APIキー未設定 | Freeプラン相当（6軸）で続行。株価チャートなし |
| JQuants APIエラー | テクニカル/需給をスキップし、6軸で続行 |
| 個別スキルの実行失敗 | そのPhaseをスキップし、コメントに「データ不足のため省略」と記載 |
| Playwright未インストール | 「bunx playwright install chromium を実行してください」と案内して終了 |

## comprehensive-analysisとの関係

- comprehensive-analysisは変更なし
- Phase 8で「PDFも出しますか？」と聞く動作はそのまま
- pdf-reportスキルはcomprehensive-analysisと同等の分析を内部で実行するが、テキストレポート出力はせずPDFのみ出力
