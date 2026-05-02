# Kronos PoC 設計書

- 作成日: 2026-05-02
- ステータス: 承認待ち
- 目的: shiyu-coder/Kronos（金融Kライン用Foundation Model、MIT）を kabu-dexter に組み込むかを定量的に判断する PoC を実施する

## 1. PoC ゴール

### 1.1 採用判断の方針

既存 `src/skills/monte-carlo`（GBM ベースの確率的株価予測）と Kronos を**同じウィンドウ・同じ評価指標で比較**し、Kronos が明確に優位であれば採用、明確に劣位であれば不採用、それ以外は保留としてファインチューニング検証フェーズに進むかを別途議論する。

### 1.2 採用判定基準

3 銘柄のうち **2 銘柄以上**で以下を**両方とも**満たした場合に「採用」：

- Kronos の方向一致率 ≥ GBM の方向一致率 + 5pt
- Kronos の MAE on close ≤ GBM の MAE on close

3 銘柄全敗（方向一致率も MAE も劣る）なら「不採用」。それ以外は「保留」。

### 1.3 PoC スコープ外

- ファインチューニング（生のままで勝てなければ採用しない）
- kabu-dexter のスキル統合（採用判断後に別仕様で設計）
- 4 銘柄以上への拡張（Kronos が日本株で筋が通るかをまず確認する段階）
- 60 日先など長期ホライゾンの評価（短期で結論が出る）

## 2. アーキテクチャ

### 2.1 成果物

- `notebooks/kronos_poc.ipynb`（Colab で実行する単一の Jupyter notebook）
- 出力（HTML レポートまたは PDF）はノートブック実行後にローカルへダウンロードして保管。リポジトリには含めない

### 2.2 実行環境

- Google Colab 無料枠（GPU が割り当たれば使う、なければ CPU）
- 想定実行時間: GPU で 10〜20 分、CPU で約 3 時間
- ローカル Mac には PyTorch 等を一切インストールしない

### 2.3 役割分担

| 構成要素 | 役割 |
|---------|------|
| JQuants API（Premium 契約済み） | 7203 / 6758 / 9984 × 過去 3 年分（約 750 営業日）の調整済 OHLCV |
| Hugging Face Hub（NeoQuasar/Kronos-*） | Kronos-small（24.7M params）と Kronos-Tokenizer-base の重み配信 |
| Colab 実行環境 | Kronos 推論、GBM ベースライン計算、評価指標算出、可視化を 1 ノートブックで完結 |
| ローカル Mac | ノートブックを開いて Run All を押し、結果をダウンロードする受け皿 |

### 2.4 外部 I/O

- JQuants: 1 セッションで 3 API call（銘柄ごと）
- Hugging Face Hub: 起動時に重みダウンロード（約 100MB、1 セッションに 1 度）
- それ以外のネットワーク通信なし。ファインチューニングはしない

### 2.5 セキュリティ

- API キーはノートブックにハードコードしない（`getpass` で対話入力、Colab Secrets 利用可）
- 結果保存時はセル出力をクリアしてから保存（README に手順明記）
- Kronos の重みは safetensors 形式のみ取得（実行コードを含まない）

## 3. コンポーネント

### 3.1 ノートブックのセル構成

| # | セル名 | 入力 | 出力 | 主要処理 |
|---|--------|------|------|---------|
| 1 | `setup` | なし | パッケージ導入完了 | `pip install torch numpy pandas einops huggingface_hub safetensors matplotlib tqdm` |
| 2 | `auth` | ユーザー対話入力 | `JQUANTS_API_KEY`（環境変数） | `getpass` で入力。Colab Secrets と併用可 |
| 3 | `fetch_data` | API キー、銘柄リスト | `df_dict: Dict[str, DataFrame]` | JQuants `/v2/equities/bars/daily` を 3 回呼ぶ。過去 3 年分。銘柄ごと 0.5 秒 sleep |
| 4 | `load_kronos` | なし | `predictor: KronosPredictor` | HF から `Kronos-Tokenizer-base` と `Kronos-small` をロード、`max_context=512`、device 自動判定 |
| 4.5 | `smoke_test` | df_dict, predictor | アサート通過 | 1 ウィンドウ × 2 サンプルの最小実行で配管全体を確認 |
| 5 | `walkforward_kronos` | df_dict, predictor | `kronos_results: List[Window]` | 36 ウィンドウ × 3 銘柄 = 108 ウィンドウ。各ウィンドウで `predict(sample_count=30)` |
| 6 | `walkforward_gbm` | df_dict | `gbm_results: List[Window]` | 同じ 108 ウィンドウで GBM をサンプル数 30 で実行 |
| 6.5 | `gbm_sanity` | gbm_results | アサート通過 | 経験平均と理論平均 `S0 * exp(μ * 20)` の乖離が 10% 以内 |
| 7 | `metrics` | kronos_results, gbm_results | 指標テーブル | 方向一致率 / MAE on close / 80% PI カバレッジを銘柄 × モデルで算出 |
| 7.5 | `metrics_sanity` | なし | アサート通過 | 完璧予測ケースで 1.0/0/1.0、完全外しケースで 0/-/0 になることを検算 |
| 8 | `visualize` | 結果一式 | matplotlib 図 | 銘柄別の代表ウィンドウ 3 つで「実測 / Kronos 予測区間 / GBM 予測区間」を可視化 |
| 9 | `verdict` | 指標テーブル | Markdown 判定文 | 採用 / 不採用 / 保留の判定を表示 |

### 3.2 Window データ構造

セル 5 と 6 が共通形式で結果を返すことで、評価ロジック（セル 7）を 1 本化する。

```python
{
  "code": str,                          # "7203" / "6758" / "9984"
  "lookback_end": pd.Timestamp,         # lookback 履歴の最終日
  "horizon_dates": List[pd.Timestamp],  # 予測対象 20 営業日
  "actual": List[float],                # 実測終値（評価用）
  "predicted_paths": np.ndarray,        # shape=(30, 20) サンプル × 日数の終値経路
  "S0": float,                          # lookback 末日の終値（評価用）
}
```

## 4. データフロー & 評価プロトコル

### 4.1 ウィンドウ生成

```text
T_end = 直近営業日
i = 0..35:
  origin_i        = T_end - (35 - i) * 21 営業日   (stride = 21営業日 ≒ 1ヶ月)
  lookback_window = [origin_i - 256, origin_i]     (256本のOHLCV)
  horizon_window  = [origin_i + 1, origin_i + 20]  (20本の実測終値)
```

各銘柄独立に 36 ウィンドウ。3 銘柄 × 36 = 108 ウィンドウ × 30 サンプル = 3,240 回の推論。

### 4.2 Kronos 予測フロー（1 ウィンドウあたり）

1. lookback_window の OHLCV 256 本 + amount 列（0 埋め）を DataFrame に整形
2. `y_timestamp` = horizon_window の 20 営業日の `pd.Timestamp` 配列
3. `predictor.predict(df=x_df, x_timestamp=lookback_dates, y_timestamp=y_timestamp, pred_len=20, T=1.0, top_p=0.9, sample_count=30)`
4. 返値の close 列を `(30, 20)` の ndarray として保存

### 4.3 GBM 予測フロー（1 ウィンドウあたり、apples-to-apples）

`src/skills/monte-carlo/SKILL.md` の式を Python で実装：

1. lookback_window 終値から日次対数リターン `r_t = ln(S_t / S_{t-1})` を計算
2. `μ_daily = mean(r)`, `σ_daily = std(r)`
3. `S_0 = lookback_window 末日の終値`
4. 30 サンプル × 20 日のシミュレーション:
   ```
   for j in 1..20:
     Z ~ N(0, 1)
     S_j = S_{j-1} * exp((μ_daily - σ_daily²/2) + σ_daily * Z)
   ```
5. `(30, 20)` の ndarray として保存

年率換算は不要（日次 → 日次なので直接そのまま使う）。

### 4.4 評価指標

すべて**ホライゾン終端（20 日目）**を評価点とする。経路全体の指標は出さない（PoC では最終値が判定に最も重要）。

| 指標 | 計算式 |
|------|--------|
| 方向一致率 | `count(sign(median(predicted[:, -1]) - S_0) == sign(actual[-1] - S_0)) / 36` |
| MAE on close (%) | `mean(|median(predicted[:, -1]) - actual[-1]| / actual[-1] * 100)` |
| 80% PI カバレッジ | `count(p10(predicted[:, -1]) ≤ actual[-1] ≤ p90(predicted[:, -1])) / 36` |

理想カバレッジは 0.80。極端に低い／高い場合は予測区間の校正が崩れていることを示す。

### 4.5 出力テーブル形式（セル 7 → 9 で参照）

| 銘柄 | モデル | 方向一致率 | MAE(%) | 80% PI カバレッジ |
|------|--------|-----------|--------|-----------------|
| 7203 | Kronos | 0.61 | 3.8 | 0.78 |
| 7203 | GBM | 0.53 | 4.2 | 0.81 |
| 6758 | Kronos | … | … | … |
| 6758 | GBM | … | … | … |
| 9984 | Kronos | … | … | … |
| 9984 | GBM | … | … | … |

## 5. エラー処理 & 中断耐性

### 5.1 想定失敗と対応

| 失敗 | 検知 | 対応 |
|------|------|------|
| JQuants API キー誤入力 | 401 / 403 | `getpass` 再入力プロンプト、Premium 権限を案内 |
| JQuants レート制限 | 429 | exponential backoff（1s → 2s → 4s、最大 3 回） |
| JQuants データ欠損 | 行数の不足 | ウィンドウ生成時に lookback 256 + horizon 20 が揃っているかチェック、足りないものはスキップ |
| HF Hub からのモデルダウンロード失敗 | セル 4 で例外 | 1 回リトライ、ダメならランタイム再起動を案内 |
| 推論中の OOM | RuntimeError | `sample_count` を 30 → 10 に下げて再開、有意性低下を警告 |
| Colab セッション切断 | 変数消失 | セル 5/6 はウィンドウごとに pickle 追記、再実行で未処理分のみ再開 |
| GBM σ がゼロ | 計算後アサート | 該当ウィンドウをスキップ、ログ記録 |
| 予測値に NaN/Inf 混入 | セル 7 冒頭でアサート | 該当ウィンドウをスキップ、metric の分母を補正 |

### 5.2 中断再開設計（セル 5 の擬似コード）

```python
results_path = "/content/kronos_results.pkl"
results = pickle.load(open(results_path, "rb")) if os.path.exists(results_path) else []
done_keys = {(r["code"], r["lookback_end"]) for r in results}

for code, df in df_dict.items():
    for origin in window_origins(df):
        if (code, origin) in done_keys:
            continue
        result = run_kronos_window(...)
        results.append(result)
        pickle.dump(results, open(results_path, "wb"))
```

セル 6（GBM）も同等の追記方式で実装。

### 5.3 API キー漏洩防止

- セル 2 で入力後、`os.environ["JQUANTS_API_KEY"]` に格納し変数自体は表示しない
- リクエストヘッダ部のログ出力は `Authorization: Bearer ****` 形式でマスク
- ノートブック保存前に `Cell > All output > Clear` を実行する手順を README に明記

### 5.4 結果整合性アサーション（セル 7 冒頭、必須）

```python
assert len(kronos_results) == len(gbm_results)
for k, g in zip(kronos_results, gbm_results):
    assert k["code"] == g["code"]
    assert k["lookback_end"] == g["lookback_end"]
    assert k["actual"] == g["actual"]
    assert k["predicted_paths"].shape == g["predicted_paths"].shape
```

apples-to-apples 比較を**コードで担保**。何か壊れていれば指標を出す前に止まる。

## 6. テスト戦略

### 6.1 Layer 1: スモークテスト（セル 4.5、必須）

セル 4 直後に「1 銘柄 1 ウィンドウ × 2 サンプル」の最小実行を挟み、API キー・データ取得・モデルロード・推論パイプラインの配管が全部生きていることを 10 秒で確認。本番 3 時間を回す前にここで失敗を検知する。

### 6.2 Layer 2: GBM 実装の検算（セル 6.5、必須）

経験平均と理論平均 `S_0 * exp(μ * 20)` の乖離が 10% 以内かをアサート。明らかな実装バグ（μ を年率で使ってしまった等）を検出する。

### 6.3 Layer 3: 評価ロジックの自己検算（セル 7.5、必須）

人工データの「完璧予測ケース」で `directional_acc = 1.0, mae_pct = 0.0, pi80_coverage = 1.0`、「完全外しケース」で `directional_acc = 0.0` になることを検算。

### 6.4 Layer 4: 結果のサニティ確認（セル 8、目視）

- Kronos の予測中央値経路が lookback 末端からなめらかに伸びているか（不連続なら入力 tokenize 不正）
- GBM の予測区間が時間とともに `√t` で発散しているか
- 80% PI カバレッジが極端に低い／高い銘柄があれば経路を目視確認

### 6.5 何をテストしないか（YAGNI）

- ユニットテストの自動化（pytest 等）: ノートブックは 1 回限りの PoC 成果物
- 実 JQuants API のモック: 落ちたら検知してリトライする方針
- Kronos 内部の単体テスト: 上流の責務、PoC 範囲外
- 回帰テスト: 毎回サンプリングが変わるため過去結果との一致は要求しない

## 7. オープン事項

- Colab で GPU 割当てが受けられるかは時間帯依存。割当てなしの場合 3 時間程度かかるが、中断再開設計で対応する
- Kronos-small は中国 A 株中心の事前学習データで構築されているため、日本株で素のままで筋が通るかは PoC の主たる検証点
- PoC 結果が「保留」となった場合、ファインチューニング検証フェーズに進むかは別途議論する
