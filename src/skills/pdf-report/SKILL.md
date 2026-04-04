---
name: pdf-report
description: 総合分析結果をビジュアルPDFレポートとして出力する。レーダーチャートと横棒グラフで8軸スコアを可視化し、初心者にもわかりやすい形式で提供。「レポート出して」「PDF出して」「レポートにして」のように分析結果のレポート化を求められたときに使用。
---

# PDFレポート出力 Skill

総合分析（comprehensive-analysis）の結果をビジュアルPDFレポートとして出力する。

## 前提条件

- 総合分析が完了していること（分析データが存在すること）
- 分析データがない場合は「先に分析を実行してください」と案内する

## Workflow

1. 総合分析の各フェーズの結果を収集
2. `scores.ts` で8軸スコア（0〜100）に変換
3. 業界平均を `screen_stocks` で取得（取得不可時はデフォルト50）
4. `generate.ts` でHTMLテンプレートにデータ注入 → PlaywrightでPDF化
5. `output/{code}_report_{date}.pdf` に保存
6. ユーザーに出力パスを伝える

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
