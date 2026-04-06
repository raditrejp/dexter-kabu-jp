---
name: pdf-report
description: 銘柄コード指定のみで、フル分析→ビジュアルPDFレポート出力まで1コマンドで完結する。レーダーチャートと横棒グラフで8軸スコアを可視化し、初心者にもわかりやすい形式で提供。「レポート出して」「PDF出して」「レポートにして」のように求められたときに使用。
---

# PDFレポート出力 Skill

銘柄コード指定のみで、データ取得→全Phase分析→スコア計算→コメント生成→PDF出力まで一気通貫で実行する。

## 前提条件

- `.env`に`RADIKABUNAVI_API_KEY`が設定されていること（必須）
- `.env`に`JQUANTS_API_KEY`が設定されていること（推奨。なければ6軸で続行）
- Playwrightがインストールされていること（`bunx playwright install chromium`）

## Workflow Checklist

ユーザーが「レポート出して {銘柄コード}」と言ったら、以下を順番に実行する。

```
PDF Report Progress:
- [ ] Step 0: 銘柄コード受け取り + 環境確認
- [ ] Step 1: 基本情報 + 財務データ取得
- [ ] Step 2: 株価データ取得（Light以上）
- [ ] Step 3: 信用残取得（Standard以上）
- [ ] Step 4: 各Phase分析（コメント材料収集）
- [ ] Step 5: AnalysisInput構築
- [ ] Step 6: テクニカル/需給データ上書き
- [ ] Step 7: 8軸スコア算出
- [ ] Step 8: コメント生成
- [ ] Step 9: PDF生成
- [ ] Step 10: 完了報告
```

## Step 0: 銘柄コード受け取り + 環境確認

1. 銘柄コード（4桁 or 5桁）を受け取る。4桁の場合は末尾に0を付けて5桁にする
2. `.env`を読み、`RADIKABUNAVI_API_KEY`があることを確認。なければ案内して終了
3. `JQUANTS_API_KEY`の有無を確認
4. `JQUANTS_PLAN`環境変数でプラン判定（free/light/standard/premium、デフォルトfree）

**プラン別の挙動:**
| JQuantsプラン | 利用可能な軸 | 株価チャート | 2段表示（決算時→現在） |
|-------------|-----------|-----------|-------------------|
| Free（またはキーなし） | 6軸（トレンド・需給なし） | なし | なし（決算時のみ） |
| Light | 7軸（トレンド追加） | あり | あり |
| Standard+ | 8軸（需給追加） | あり | あり |

## Step 1: 基本情報 + 財務データ取得（ラジ株ナビMCP）

1. `get_edinet_financial_data`で年次財務データを取得（銘柄コード指定）
2. `get_edinet_financial_summary`で最新年度サマリーを取得
3. 以下を確認・記録する:
   - 銘柄名
   - セクター / 業種
   - 市場
   - 配当の有無（無配ならPhase 1cスキップ）
   - 金融業かどうか（銀行業・保険業・証券/商品先物取引業・その他金融業 → Phase 2スキップ）

## Step 2: 株価データ取得（JQuants API）— Light以上のみ

**Freeプランまたはキーなしの場合はスキップする。**（12週=約60日ではSMA200算出不可）

1. JQuants API v2 `equities/bars/daily`で日足OHLCV取得（260日+）
   - エンドポイント: `GET https://api.jquants.com/v2/equities/bars/daily?code={5桁コード}&from={YYYY-MM-DD}&to={YYYY-MM-DD}`
   - ヘッダー: `x-api-key: {JQUANTS_API_KEY}`
2. レスポンスの`data`配列をOHLCVBar形式に変換:
   - `{ date: d.Date, open: d.AdjO, high: d.AdjH, low: d.AdjL, close: d.AdjC, volume: d.AdjVo }`
3. `technical.ts`の`analyzeTechnical(bars)`でテクニカル指標を計算
4. priceDataにSMA50/SMA200を付与（PDFチャート用）:
   - `calcSMA(closes, 50)` / `calcSMA(closes, 200)`で各日のSMAを算出し、priceDataの各エントリに`sma50`/`sma200`フィールドを追加
5. **現在株価**: JQuantsの最新終値を使用

**Freeプランの場合の現在株価:** ラジ株ナビ`get_edinet_financial_summary`の株価情報から取得（決算時株価）

## Step 3: 信用残取得（JQuants API）— Standard以上のみ

**Standardプラン未満の場合はスキップ。**

1. `supply-demand.ts`の`fetchSupplyDemandData(code, plan)`で信用残取得
2. 取得できた場合、以下を記録:
   - `marginBalanceRatio`（信用倍率）
   - `latestLongVol`（買い残）
   - `latestShortVol`（売り残）

## Step 4: 各Phase分析（コメント材料収集）

**目的: Step 8のコメント生成の材料を集める。スコア計算には使わない。**

各Phaseのスキルを`skill`ツールで順次呼び出す。各スキルの出力テキストをStep 8で参照する。

| Phase | `skill`ツールで呼ぶスキル名 | コメント材料 | スキップ条件 |
|-------|--------------------------|------------|------------|
| 1a | dcf | 理論株価・割安/割高の根拠 | - |
| 1b | peer-comparison | 同業他社比較の文脈 | - |
| 1c | dividend | 配当の評価 | 無配銘柄 |
| 2 | altman-z | 倒産リスク評価 | 金融業 |
| 3a | sepa | ステージ解説 | Freeプラン |
| 3b | dow-theory | トレンド判定 | Freeプラン |
| 3c | granville | シグナル解説 | Freeプラン |
| 4a | supply-demand | 需給評価 | Standard未満 |
| 4b | shikori | しこり玉解説 | Freeプラン |
| 5 | monte-carlo | 確率予測 + 上昇確率 | Freeプラン |
| 6 | correlation | 相関分析 | Freeプラン |

Phase 1d（PEG）と1e（ネットネット）は`data-builder.ts`が自動算出するためスキル呼び出し不要。

**ツール呼び出し上限に近い場合の優先順位:**
1. Phase 1（ファンダメンタル）— 最重要
2. Phase 3（テクニカル）— タイミング判断に必須
3. Phase 4（需給）— 短期判断に重要
4. Phase 2（信用リスク）— 安全性確認
5. Phase 5（モンテカルロ）— 補完的
6. Phase 6（相関）— 補助的

上限に達しそうな場合は上位を優先し、下位はスキップしてコメントに「データ不足のため省略」と記載する。

## Step 5: AnalysisInput構築

`data-builder.ts`の`buildAnalysisInput()`を使ってAnalysisInputを構築する。

1. `buildAnalysisInput(annualData, currentPrice, sector, false)` — 決算時株価ベース（メインスコア用）
2. Light以上の場合のみ追加: `buildAnalysisInput(annualData, currentPrice, sector, true)` — 現在株価ベース（2段表示用）

引数:
- `annualData`: Step 1で取得した`get_edinet_financial_data`の戻り値
- `currentPrice`: Step 2のJQuants最新終値（Freeの場合はStep 1のサマリーから）
- `sector`: Step 1で確認した業種名

## Step 6: テクニカル/需給データで上書き

Step 2・Step 3の結果でAnalysisInputのデフォルト値を上書きする。

**テクニカル（Light以上の場合）:**
```
analysisInput.technical = {
  sepaStage: technicalResult.sepaStage,
  dowTrend: technicalResult.dowTrend,
  granvilleSignal: technicalResult.granvilleSignal,
}
```

**需給（Standard以上 + データ取得成功の場合）:**
```
analysisInput.supplyDemand.marginBalanceRatio = supplyDemandData.marginBalanceRatio
analysisInput.supplyDemand.volumeRatio5d20d = technicalResult.volumeRatio5d20d
```

**モンテカルロ上昇確率（Phase 5実行済みの場合）:**
Step 4のPhase 5（monte-carlo）の結果から上昇確率を読み取り:
```
analysisInput.supplyDemand.monteCarloUpProb = {Phase 5の上昇確率}
```

## Step 7: 8軸スコア算出

`scores.ts`の`calculateAllScores(analysisInput)`で8軸スコアを算出する。

- 決算時スコア: Step 5-1のAnalysisInputから算出 → `scores`
- 現在株価スコア（Light以上）: Step 5-2のAnalysisInputから算出 → `scoresAtReport`（※命名注意: generateのReportInput上は決算時が`scoresAtReport`、現在が`scores`）

基準値（industryAvg）は全軸50固定:
```
{ valuation: 50, profitability: 50, growth: 50, safety: 50, trend: 50, supplyDemand: 50, shareholderReturn: 50, moat: 50 }
```

## Step 8: コメント生成

Step 1〜7の分析結果とStep 4の各Phaseテキストを参照し、以下を生成する。

### 8a. 各軸の根拠テキスト（details）

8軸それぞれについて2〜4文の根拠テキストを書く。`details`オブジェクトのキー: `valuation`, `profitability`, `growth`, `safety`, `trend`, `supplyDemand`, `shareholderReturn`, `moat`

**コメント生成ルール:**
- **移動平均線の具体的な数値（SMA50: ○○円等）は記載しない。** 判定結果と解釈のみ
- 数値は絶対的な基準値と比較する形で記載（例: 「ROE 13.3%は一般的な優良水準10%を上回る」）
- **株価依存の指標は決算時と現在の両方を記載する**（Light以上の場合）
  - 割安度: 「PER 7.3倍（決算時）→ 9.1倍（現在）」
  - 還元力: 「配当利回り3.4%（決算時）→ 2.8%（現在）」
- 株価非依存の指標（稼ぐ力・成長性・安全性・事業独占力）は決算時の値のみ
- JQuants Freeプランの場合: 現在株価が取れないため決算時の値のみ記載
- SEPAステージの意味を日本語で解説（S1=底固め期、S2=上昇期、S3=天井形成期、S4=下落期）
- 初心者にもわかりやすい表現を使う
- トレンド/需給が利用不可の場合、そのキーには「JQuants {Light/Standard}プラン以上で利用可能」と記載

### 8b. 総合サマリー（summary）

3〜5文で総合的な見解を記載する:
- 最も目立つ強み
- 最も注意すべき弱み
- 総合的な投資判断の方向性（ただし投資助言ではない旨を付記）

### 8c. リスク要因（risks）

2〜4件のリスク要因を `{ title: string, description: string }` 形式で列挙する。
- 財務面のリスク（該当する場合）
- 市場・テクニカル面のリスク（該当する場合）
- セクター固有のリスク
- マクロ環境リスク

## Step 9: ReportInput組み立て → PDF生成

Step 1〜8の結果から`ReportInput`を組み立て、`generate.ts`の`generateReport()`でPDFを出力する。

**ReportInputの組み立て:**
```typescript
{
  code: "7203",             // 4桁コード
  name: "トヨタ自動車",      // Step 1
  sector: "輸送用機器",      // Step 1
  market: "プライム",        // Step 1
  price: 2530,              // Step 2 or Step 1
  marketCap: 420000,        // 億円単位
  analysisDate: "2026-04-06",
  scores: {現在株価ベーススコア},      // Step 7（Freeなら決算時スコア）
  scoresAtReport: {決算時株価ベーススコア},  // Step 7（Freeならnull）
  industryAvg: {全軸50},
  details: {Step 8aの8軸テキスト},
  summary: "Step 8bのサマリー",
  risks: [Step 8cのリスク配列],
  priceData: [Step 2の株価データ+SMA],  // Freeなら空配列
  hasJQuants: planLevel >= 1,
  hasSupplyDemandData: supplyDemandData !== null,
  keyMetrics: {
    per: xxx,
    pbr: xxx,
    eps: xxx,
    bps: xxx,
    roe: xxx,
    payoutRatio: xxx,
    marginBalanceRatio: xxx | null,
  },
}
```

**PDF生成:**
```
const outputPath = await generateReport(reportInput);
```

出力先: `output/{4桁コード}_report_{YYYY-MM-DD}.pdf`

## Step 10: 完了報告

PDFの出力パスをユーザーに伝える:
「PDFレポートを出力しました: `output/{code}_report_{date}.pdf`」

## エラーハンドリング

| エラー | 対応 |
|-------|------|
| ラジ株ナビAPIキー未設定 | 「.envにRADIKABUNAVI_API_KEYを設定してください」と案内して終了 |
| 銘柄コードが見つからない | 「銘柄コード{code}のデータが見つかりませんでした」と案内して終了 |
| JQuants APIキー未設定 | Freeプラン相当（6軸）で続行。株価チャートなし |
| JQuants APIエラー | テクニカル/需給をスキップし、6軸で続行 |
| 個別スキルの実行失敗 | そのPhaseをスキップし、コメントに「データ不足のため省略」と記載 |
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
