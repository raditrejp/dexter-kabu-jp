# PDF分析レポート機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 総合分析結果を初心者向けビジュアルPDFレポートとして出力する `pdf-report` スキルを実装する

**Architecture:** 分析結果を7軸スコア（0〜100）に変換する `scores.ts`、HTMLテンプレートにデータを注入してPlaywrightでPDF化する `generate.ts`、スキル定義の `SKILL.md` の3ファイル構成。既存の総合分析スキルの Phase 7 完了後に呼び出す。

**Tech Stack:** TypeScript (Bun), Chart.js (CDN), Playwright (既存依存), vitest (テスト)

**Spec:** `docs/specs/2026-04-04-pdf-report-design.md`

---

## File Structure

```
src/skills/pdf-report/
├── SKILL.md                          # スキル定義
├── scores.ts                         # 7軸スコア変換ロジック
├── generate.ts                       # HTML注入 + PDF生成
└── templates/
    ├── report.html                   # 本番HTMLテンプレート
    └── mockup.html                   # デザインモックアップ（既存）

src/skills/pdf-report/__tests__/
├── scores.test.ts                    # スコア変換のユニットテスト
└── generate.test.ts                  # PDF生成の統合テスト

src/skills/comprehensive-analysis/
└── SKILL.md                          # 修正: Phase 7 後にPDFレポート提案を追記

CLAUDE.md                             # 修正: スキル対応表にpdf-report追加
.gitignore                            # 修正: output/ 追加
```

---

### Task 1: スコア変換ロジック — 型定義

**Files:**
- Create: `src/skills/pdf-report/scores.ts`
- Create: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: 型定義のテストを書く**

```typescript
// src/skills/pdf-report/__tests__/scores.test.ts
import { describe, test, expect } from 'vitest';
import type { AnalysisInput, SevenAxisScores } from '../scores.js';

describe('type definitions', () => {
  test('AnalysisInput accepts valid data', () => {
    const input: AnalysisInput = {
      fundamentals: {
        dcfGapPercent: 12.6,
        per: 15,
        pbr: 1.2,
        ncavToMarketCap: 0.3,
        roe: 18.2,
        operatingMarginPercent: 9.8,
        roa: 7.5,
        revenueCagr3y: 3.2,
        epsCagr3y: 2.1,
        peg: 1.3,
        equityRatio: 52,
        altmanZ: 3.2,
        isFinancial: false,
      },
      industryAvg: {
        per: 20,
        operatingMarginPercent: 7.5,
      },
      technical: {
        sepaStage: 'S2',
        dowTrend: 'up',
        granvilleSignal: 'B2',
      },
      supplyDemand: {
        marginBalanceRatio: 3.1,
        volumeRatio5d20d: 1.15,
        monteCarloUpProb: 0.62,
      },
      shareholderReturn: {
        dividendYield: 2.8,
        dividendGrowthRate3to5y: 8,
        payoutRatio: 32,
        doe: 3.5,
        hasBuyback: true,
        buybackRecency: 'within1y',
        totalReturnRatio: 55,
        isNoDividend: false,
      },
    };
    expect(input).toBeDefined();
  });

  test('SevenAxisScores has all 7 keys', () => {
    const scores: SevenAxisScores = {
      valuation: 72,
      profitability: 85,
      growth: 45,
      safety: 78,
      trend: 68,
      supplyDemand: 62,
      shareholderReturn: 75,
    };
    expect(Object.keys(scores)).toHaveLength(7);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test src/skills/pdf-report/__tests__/scores.test.ts`
Expected: FAIL — `scores.js` が存在しない

- [ ] **Step 3: 型定義を実装**

```typescript
// src/skills/pdf-report/scores.ts

/** 分析フェーズから受け取る入力データ */
export interface AnalysisInput {
  fundamentals: {
    dcfGapPercent: number;       // DCF乖離率（%）正=割安
    per: number;
    pbr: number;
    ncavToMarketCap: number;     // NCAV/時価総額
    roe: number;                 // %
    operatingMarginPercent: number;
    roa: number;                 // %
    revenueCagr3y: number;       // 売上3年CAGR（%）
    epsCagr3y: number;           // EPS3年CAGR（%）
    peg: number | null;          // null=算出不可
    equityRatio: number;         // 自己資本比率（%）
    altmanZ: number | null;      // null=金融業でスキップ
    isFinancial: boolean;
  };
  industryAvg: {
    per: number;
    operatingMarginPercent: number;
  };
  technical: {
    sepaStage: 'S1' | 'S2' | 'S3' | 'S4';
    dowTrend: 'up' | 'range' | 'down';
    granvilleSignal: 'B1' | 'B2' | 'B3' | 'B4' | 'S1' | 'S2' | 'S3' | 'S4' | null;
  };
  supplyDemand: {
    marginBalanceRatio: number;  // 信用倍率
    volumeRatio5d20d: number;    // 5日平均/20日平均（1.0=同等）
    monteCarloUpProb: number;    // 0〜1
  };
  shareholderReturn: {
    dividendYield: number;       // %
    dividendGrowthRate3to5y: number; // 年平均増配率（%）
    payoutRatio: number;         // 配当性向（%）
    doe: number;                 // DOE（%）
    hasBuyback: boolean;
    buybackRecency: 'within1y' | 'within3y' | 'none';
    totalReturnRatio: number;    // 総還元性向（%）
    isNoDividend: boolean;
  };
}

/** 7軸スコア（各0〜100） */
export interface SevenAxisScores {
  valuation: number;
  profitability: number;
  growth: number;
  safety: number;
  trend: number;
  supplyDemand: number;
  shareholderReturn: number;
}
```

- [ ] **Step 4: テスト実行 → パス確認**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test src/skills/pdf-report/__tests__/scores.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): add type definitions for score conversion"
```

---

### Task 2: スコア変換 — clamp と線形補間ヘルパー

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: ヘルパーのテストを書く**

```typescript
// scores.test.ts に追記
import { clamp, lerp } from '../scores.js';

describe('clamp', () => {
  test('clamps below min', () => expect(clamp(-5, 0, 100)).toBe(0));
  test('clamps above max', () => expect(clamp(120, 0, 100)).toBe(100));
  test('passes through in range', () => expect(clamp(50, 0, 100)).toBe(50));
});

describe('lerp (linear interpolation)', () => {
  test('maps input range to output range', () => {
    // DCF乖離率: -30→10, 0→50, +30→90
    expect(lerp(0, -30, 30, 10, 90)).toBeCloseTo(50);
    expect(lerp(30, -30, 30, 10, 90)).toBeCloseTo(90);
    expect(lerp(-30, -30, 30, 10, 90)).toBeCloseTo(10);
    expect(lerp(15, -30, 30, 10, 90)).toBeCloseTo(70);
  });

  test('clamps output outside input range', () => {
    expect(lerp(50, -30, 30, 10, 90)).toBe(90);
    expect(lerp(-50, -30, 30, 10, 90)).toBe(10);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test src/skills/pdf-report/__tests__/scores.test.ts`
Expected: FAIL — `clamp`, `lerp` が未エクスポート

- [ ] **Step 3: ヘルパーを実装**

```typescript
// scores.ts に追記

/** 値をmin〜maxの範囲にクランプ */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 入力値を[inMin, inMax]から[outMin, outMax]に線形変換。範囲外はクランプ。 */
export function lerp(
  value: number,
  inMin: number, inMax: number,
  outMin: number, outMax: number,
): number {
  const t = (value - inMin) / (inMax - inMin);
  const clamped = Math.min(Math.max(t, 0), 1);
  return outMin + clamped * (outMax - outMin);
}
```

- [ ] **Step 4: テスト実行 → パス確認**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test src/skills/pdf-report/__tests__/scores.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): add clamp and lerp helpers"
```

---

### Task 3: スコア変換 — 割安度（Valuation）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcValuation } from '../scores.js';

describe('calcValuation', () => {
  test('DCF +30% gap → high score', () => {
    const score = calcValuation(
      { dcfGapPercent: 30, per: 15, pbr: 0.8, ncavToMarketCap: 0.3 },
      { per: 20 },
    );
    // DCF: 90 * 0.6 = 54, PER: 75 * 0.2 = 15, PBR: +5 * 0.1 = 0.5, NN: 0 * 0.1 = 0
    expect(score).toBeGreaterThan(65);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('DCF -30% gap → low score', () => {
    const score = calcValuation(
      { dcfGapPercent: -30, per: 30, pbr: 3.0, ncavToMarketCap: 0.2 },
      { per: 20 },
    );
    expect(score).toBeLessThan(30);
  });

  test('net-net stock gets large bonus', () => {
    const withNetNet = calcValuation(
      { dcfGapPercent: 0, per: 20, pbr: 0.4, ncavToMarketCap: 1.6 },
      { per: 20 },
    );
    const withoutNetNet = calcValuation(
      { dcfGapPercent: 0, per: 20, pbr: 0.4, ncavToMarketCap: 0.3 },
      { per: 20 },
    );
    expect(withNetNet - withoutNetNet).toBeGreaterThan(5);
  });

  test('result clamped to 0-100', () => {
    const score = calcValuation(
      { dcfGapPercent: 100, per: 5, pbr: 0.3, ncavToMarketCap: 2.0 },
      { per: 20 },
    );
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcValuation を実装**

```typescript
// scores.ts に追記

export function calcValuation(
  data: Pick<AnalysisInput['fundamentals'], 'dcfGapPercent' | 'per' | 'pbr' | 'ncavToMarketCap'>,
  industry: Pick<AnalysisInput['industryAvg'], 'per'>,
): number {
  // 主指標: DCF乖離率（60%）— -30→10, 0→50, +30→90
  const dcfScore = lerp(data.dcfGapPercent, -30, 30, 10, 90);

  // 補助: PER vs業界平均（20%）— 低い方が高スコア
  const perRatio = data.per / industry.per;
  const perScore = lerp(perRatio, 0.5, 1.5, 90, 10);

  // 補助: PBR（10%）
  let pbrBonus = 0;
  if (data.pbr <= 0.5) pbrBonus = 10;
  else if (data.pbr <= 1.0) pbrBonus = 5;

  // 補助: ネットネット判定（10%）
  let nnBonus = 0;
  const nn = data.ncavToMarketCap;
  if (nn > 1.5) nnBonus = 10;
  else if (nn >= 1.0) nnBonus = 7;
  else if (nn >= 0.67) nnBonus = 3;

  const raw = dcfScore * 0.6 + perScore * 0.2 + pbrBonus * 0.1 + nnBonus * 0.1;
  return clamp(Math.round(raw), 0, 100);
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement valuation score calculation"
```

---

### Task 4: スコア変換 — 稼ぐ力（Profitability）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcProfitability } from '../scores.js';

describe('calcProfitability', () => {
  test('high ROE + high margin → high score', () => {
    const score = calcProfitability(
      { roe: 20, operatingMarginPercent: 15, roa: 8 },
      { operatingMarginPercent: 7.5 },
    );
    expect(score).toBeGreaterThan(80);
  });

  test('low ROE → low score', () => {
    const score = calcProfitability(
      { roe: 3, operatingMarginPercent: 2, roa: 1 },
      { operatingMarginPercent: 7.5 },
    );
    expect(score).toBeLessThan(30);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcProfitability を実装**

```typescript
export function calcProfitability(
  data: Pick<AnalysisInput['fundamentals'], 'roe' | 'operatingMarginPercent' | 'roa'>,
  industry: Pick<AnalysisInput['industryAvg'], 'operatingMarginPercent'>,
): number {
  // 主指標: ROE（50%）
  let roeScore: number;
  if (data.roe >= 20) roeScore = 90;
  else if (data.roe >= 15) roeScore = 80;
  else if (data.roe >= 10) roeScore = 60;
  else if (data.roe >= 5) roeScore = 40;
  else roeScore = 20;

  // 補助: 営業利益率 vs業界平均（30%）
  const marginRatio = data.operatingMarginPercent / industry.operatingMarginPercent;
  const marginScore = lerp(marginRatio, 0.5, 2.0, 10, 90);

  // 補助: ROA（20%）
  let roaBonus = 0;
  if (data.roa >= 8) roaBonus = 10;
  else if (data.roa >= 5) roaBonus = 5;

  const raw = roeScore * 0.5 + marginScore * 0.3 + roaBonus * 0.2;
  return clamp(Math.round(raw), 0, 100);
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement profitability score calculation"
```

---

### Task 5: スコア変換 — 成長性（Growth）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcGrowth } from '../scores.js';

describe('calcGrowth', () => {
  test('high growth → high score', () => {
    const score = calcGrowth({ revenueCagr3y: 15, epsCagr3y: 20, peg: 0.8 });
    expect(score).toBeGreaterThan(80);
  });

  test('negative growth → low score', () => {
    const score = calcGrowth({ revenueCagr3y: -5, epsCagr3y: -3, peg: null });
    expect(score).toBeLessThan(30);
  });

  test('PEG null → no bonus/penalty', () => {
    const withPeg = calcGrowth({ revenueCagr3y: 8, epsCagr3y: 8, peg: 0.5 });
    const noPeg = calcGrowth({ revenueCagr3y: 8, epsCagr3y: 8, peg: null });
    expect(withPeg).toBeGreaterThan(noPeg);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcGrowth を実装**

```typescript
export function calcGrowth(
  data: Pick<AnalysisInput['fundamentals'], 'revenueCagr3y' | 'epsCagr3y' | 'peg'>,
): number {
  // 主指標: 売上CAGR（40%）
  const revenueScore = cagrToScore(data.revenueCagr3y);

  // 補助: EPS成長率（40%）
  const epsScore = cagrToScore(data.epsCagr3y);

  // 補助: PEG（20%）
  let pegBonus = 0;
  if (data.peg !== null) {
    if (data.peg < 0.5) pegBonus = 10;
    else if (data.peg < 1.0) pegBonus = 5;
    else if (data.peg > 2.0) pegBonus = -5;
  }

  const raw = revenueScore * 0.4 + epsScore * 0.4 + pegBonus * 0.2;
  return clamp(Math.round(raw), 0, 100);
}

function cagrToScore(cagr: number): number {
  if (cagr >= 15) return 90;
  if (cagr >= 10) return 80;
  if (cagr >= 5) return 60;
  if (cagr >= 0) return 40;
  return 20;
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement growth score calculation"
```

---

### Task 6: スコア変換 — 安全性（Safety）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcSafety } from '../scores.js';

describe('calcSafety', () => {
  test('safe zone Altman + high equity ratio', () => {
    const score = calcSafety({ altmanZ: 3.2, equityRatio: 55, isFinancial: false });
    expect(score).toBeGreaterThan(75);
  });

  test('danger zone → low score', () => {
    const score = calcSafety({ altmanZ: 0.8, equityRatio: 20, isFinancial: false });
    expect(score).toBeLessThan(25);
  });

  test('financial sector skips Altman, uses equity ratio only', () => {
    const score = calcSafety({ altmanZ: null, equityRatio: 55, isFinancial: true });
    expect(score).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcSafety を実装**

```typescript
export function calcSafety(
  data: Pick<AnalysisInput['fundamentals'], 'altmanZ' | 'equityRatio' | 'isFinancial'>,
): number {
  let altmanScore: number;

  if (data.isFinancial || data.altmanZ === null) {
    // 金融業: 自己資本比率のみ（100%）
    return clamp(Math.round(equityToScore(data.equityRatio)), 0, 100);
  }

  // 主指標: Altman Z''（60%）
  const z = data.altmanZ;
  if (z >= 3.0) altmanScore = 90;
  else if (z >= 2.6) altmanScore = 80;
  else if (z >= 1.8) altmanScore = 60;
  else if (z >= 1.1) altmanScore = 40;
  else altmanScore = 20;

  // 補助: 自己資本比率（40%）— equityToScore でベーススコア化してから加重
  const eqScore = equityToScore(data.equityRatio);

  const raw = altmanScore * 0.6 + eqScore * 0.4;
  return clamp(Math.round(raw), 0, 100);
}

/** 自己資本比率をベーススコア（0〜100）に変換。金融業の単独判定にも使用。 */
export function equityToScore(ratio: number): number {
  if (ratio >= 60) return 80;
  if (ratio >= 50) return 65;
  if (ratio >= 30) return 45;
  return 25;
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement safety score calculation"
```

---

### Task 7: スコア変換 — トレンド（Trend）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcTrend } from '../scores.js';

describe('calcTrend', () => {
  test('S2 + uptrend + B2 → high score', () => {
    const score = calcTrend({ sepaStage: 'S2', dowTrend: 'up', granvilleSignal: 'B2' });
    expect(score).toBeGreaterThan(80);
  });

  test('S4 + downtrend → low score', () => {
    const score = calcTrend({ sepaStage: 'S4', dowTrend: 'down', granvilleSignal: 'S1' });
    expect(score).toBeLessThan(25);
  });

  test('null granville signal → no bonus', () => {
    const score = calcTrend({ sepaStage: 'S1', dowTrend: 'range', granvilleSignal: null });
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(70);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcTrend を実装**

```typescript
export function calcTrend(data: AnalysisInput['technical']): number {
  // 主指標: SEPAステージ（50%）
  const sepaScoreMap: Record<string, number> = { S2: 85, S1: 60, S3: 40, S4: 20 };
  const sepaScore = sepaScoreMap[data.sepaStage] ?? 50;

  // 補助: ダウ理論（30%）
  const dowMap: Record<string, number> = { up: 15, range: 0, down: -15 };
  const dowBonus = dowMap[data.dowTrend] ?? 0;

  // 補助: グランビル（20%）
  let granvilleBonus = 0;
  if (data.granvilleSignal) {
    const gMap: Record<string, number> = {
      B1: 10, B2: 10, B3: 5, B4: 3,
      S1: -10, S2: -8, S3: -5, S4: -5,
    };
    granvilleBonus = gMap[data.granvilleSignal] ?? 0;
  }

  const raw = sepaScore * 0.5 + (50 + dowBonus) * 0.3 + (50 + granvilleBonus) * 0.2;
  return clamp(Math.round(raw), 0, 100);
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement trend score calculation"
```

---

### Task 8: スコア変換 — 需給（Supply-Demand）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcSupplyDemand } from '../scores.js';

describe('calcSupplyDemand', () => {
  test('low margin ratio + high volume → high score', () => {
    const score = calcSupplyDemand({
      marginBalanceRatio: 1.5,
      volumeRatio5d20d: 1.6,
      monteCarloUpProb: 0.75,
    });
    expect(score).toBeGreaterThan(75);
  });

  test('high margin ratio → low score', () => {
    const score = calcSupplyDemand({
      marginBalanceRatio: 12,
      volumeRatio5d20d: 0.7,
      monteCarloUpProb: 0.3,
    });
    expect(score).toBeLessThan(30);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcSupplyDemand を実装**

```typescript
export function calcSupplyDemand(data: AnalysisInput['supplyDemand']): number {
  // 主指標: 信用倍率（50%）
  let marginScore: number;
  const r = data.marginBalanceRatio;
  if (r < 1) marginScore = 90;
  else if (r < 2) marginScore = 80;
  else if (r < 3) marginScore = 70;
  else if (r < 5) marginScore = 50;
  else if (r < 10) marginScore = 30;
  else marginScore = 15;

  // 補助: 出来高トレンド（25%）
  let volBonus = 0;
  const vr = data.volumeRatio5d20d;
  if (vr >= 1.5) volBonus = 10;
  else if (vr >= 1.2) volBonus = 5;
  else if (vr < 0.8) volBonus = -5;

  // 補助: モンテカルロ上昇確率（25%）
  let mcBonus = 0;
  const mc = data.monteCarloUpProb;
  if (mc >= 0.7) mcBonus = 10;
  else if (mc >= 0.6) mcBonus = 5;
  else if (mc < 0.4) mcBonus = -5;

  const raw = marginScore * 0.5 + (50 + volBonus) * 0.25 + (50 + mcBonus) * 0.25;
  return clamp(Math.round(raw), 0, 100);
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement supply-demand score calculation"
```

---

### Task 9: スコア変換 — 還元力（Shareholder Return）

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calcShareholderReturn } from '../scores.js';

describe('calcShareholderReturn', () => {
  test('high yield + growing dividend + buyback → high score', () => {
    const score = calcShareholderReturn({
      dividendYield: 4.5,
      dividendGrowthRate3to5y: 12,
      payoutRatio: 40,
      doe: 5,
      hasBuyback: true,
      buybackRecency: 'within1y',
      totalReturnRatio: 65,
      isNoDividend: false,
    });
    expect(score).toBeGreaterThan(80);
  });

  test('kaou pattern: consecutive increase but low rate → penalized', () => {
    const score = calcShareholderReturn({
      dividendYield: 2.5,
      dividendGrowthRate3to5y: 0.5, // 花王パターン
      payoutRatio: 75,
      doe: 2.5,
      hasBuyback: false,
      buybackRecency: 'none',
      totalReturnRatio: 30,
      isNoDividend: false,
    });
    expect(score).toBeLessThan(50);
  });

  test('no dividend, no buyback → very low', () => {
    const score = calcShareholderReturn({
      dividendYield: 0,
      dividendGrowthRate3to5y: 0,
      payoutRatio: 0,
      doe: 0,
      hasBuyback: false,
      buybackRecency: 'none',
      totalReturnRatio: 0,
      isNoDividend: true,
    });
    expect(score).toBeLessThanOrEqual(20);
  });

  test('no dividend but has buyback → moderate score', () => {
    const score = calcShareholderReturn({
      dividendYield: 0,
      dividendGrowthRate3to5y: 0,
      payoutRatio: 0,
      doe: 0,
      hasBuyback: true,
      buybackRecency: 'within1y',
      totalReturnRatio: 40,
      isNoDividend: true,
    });
    expect(score).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calcShareholderReturn を実装**

```typescript
export function calcShareholderReturn(data: AnalysisInput['shareholderReturn']): number {
  // 無配銘柄: 自社株買いのみで評価
  if (data.isNoDividend) {
    if (data.buybackRecency === 'within1y') return 45;
    if (data.buybackRecency === 'within3y') return 30;
    return 15;
  }

  // 主指標: 配当利回り（25%）
  let yieldScore: number;
  const y = data.dividendYield;
  if (y >= 5) yieldScore = 90;
  else if (y >= 4) yieldScore = 80;
  else if (y >= 3) yieldScore = 70;
  else if (y >= 2) yieldScore = 55;
  else if (y >= 1) yieldScore = 40;
  else yieldScore = 0;

  // 主指標: 増配率トレンド（25%）
  let growthScore: number;
  const g = data.dividendGrowthRate3to5y;
  if (g >= 10) growthScore = 90;
  else if (g >= 5) growthScore = 70;
  else if (g >= 1) growthScore = 50;
  else if (g > 0) growthScore = 30; // 花王パターン
  else growthScore = 15; // 減配

  // 補助: 配当性向（15%）
  let payoutBonus = 0;
  if (data.payoutRatio >= 30 && data.payoutRatio <= 50) payoutBonus = 5;
  else if (data.payoutRatio > 80) payoutBonus = -10;

  // 補助: DOE（10%）
  let doeBonus = 0;
  if (data.doe >= 5) doeBonus = 10;
  else if (data.doe >= 3) doeBonus = 5;

  // 補助: 自社株買い（15%）
  let buybackBonus = 0;
  if (data.buybackRecency === 'within1y') buybackBonus = 10;
  else if (data.buybackRecency === 'within3y') buybackBonus = 5;

  // 補助: 総還元性向（10%）
  let totalReturnBonus = 0;
  const tr = data.totalReturnRatio;
  if (tr >= 50 && tr <= 80) totalReturnBonus = 5;
  else if (tr >= 30 && tr < 50) totalReturnBonus = 3;
  else if (tr > 80) totalReturnBonus = -5;

  // 補助は50をベースに加減点（calcSupplyDemand と同じ形式）
  const raw =
    yieldScore * 0.25 +
    growthScore * 0.25 +
    (50 + payoutBonus) * 0.15 +
    (50 + doeBonus) * 0.10 +
    (50 + buybackBonus) * 0.15 +
    (50 + totalReturnBonus) * 0.10;

  return clamp(Math.round(raw), 0, 100);
}
```

- [ ] **Step 4: テスト実行 → パス確認**
- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): implement shareholder return score calculation"
```

---

### Task 10: スコア変換 — 統合関数 calculateAllScores

**Files:**
- Modify: `src/skills/pdf-report/scores.ts`
- Modify: `src/skills/pdf-report/__tests__/scores.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
import { calculateAllScores } from '../scores.js';
import type { AnalysisInput } from '../scores.js';

describe('calculateAllScores', () => {
  const toyotaSample: AnalysisInput = {
    fundamentals: {
      dcfGapPercent: 12.6, per: 15, pbr: 1.2, ncavToMarketCap: 0.3,
      roe: 18.2, operatingMarginPercent: 9.8, roa: 7.5,
      revenueCagr3y: 3.2, epsCagr3y: 2.1, peg: 1.3,
      equityRatio: 52, altmanZ: 3.2, isFinancial: false,
    },
    industryAvg: { per: 20, operatingMarginPercent: 7.5 },
    technical: { sepaStage: 'S2', dowTrend: 'up', granvilleSignal: 'B2' },
    supplyDemand: { marginBalanceRatio: 3.1, volumeRatio5d20d: 1.15, monteCarloUpProb: 0.62 },
    shareholderReturn: {
      dividendYield: 2.8, dividendGrowthRate3to5y: 8, payoutRatio: 32,
      doe: 3.5, hasBuyback: true, buybackRecency: 'within1y',
      totalReturnRatio: 55, isNoDividend: false,
    },
  };

  test('returns all 7 axes', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(Object.keys(scores)).toHaveLength(7);
    for (const v of Object.values(scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  test('toyota sample: profitability should be high', () => {
    const scores = calculateAllScores(toyotaSample);
    expect(scores.profitability).toBeGreaterThan(70);
  });
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: calculateAllScores を実装**

```typescript
export function calculateAllScores(input: AnalysisInput): SevenAxisScores {
  return {
    valuation: calcValuation(input.fundamentals, input.industryAvg),
    profitability: calcProfitability(input.fundamentals, input.industryAvg),
    growth: calcGrowth(input.fundamentals),
    safety: calcSafety(input.fundamentals),
    trend: calcTrend(input.technical),
    supplyDemand: calcSupplyDemand(input.supplyDemand),
    shareholderReturn: calcShareholderReturn(input.shareholderReturn),
  };
}
```

- [ ] **Step 4: テスト実行 → パス確認**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test src/skills/pdf-report/__tests__/scores.test.ts`
Expected: ALL PASS

- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/scores.ts src/skills/pdf-report/__tests__/scores.test.ts
git commit -m "feat(pdf-report): add calculateAllScores integration function"
```

---

### Task 11: HTMLテンプレート（本番用）

**Files:**
- Create: `src/skills/pdf-report/templates/report.html`

- [ ] **Step 1: mockup.html をベースに本番テンプレートを作成**

mockup.html のハードコードデータを `{{placeholder}}` 形式のプレースホルダーに置換する。`generate.ts` がこれらを実際の値に置換する。

プレースホルダー一覧:
- `{{companyName}}`, `{{code}}`, `{{sector}}`, `{{market}}`
- `{{price}}`, `{{marketCap}}`, `{{analysisDate}}`
- `{{scoresJson}}` — 7軸スコアのJSON
- `{{industryAvgJson}}` — 業界平均のJSON
- `{{summaryComment}}` — 総合コメント
- `{{detailCards}}` — 各軸詳細のHTML
- `{{priceDataJson}}` — 株価チャートデータのJSON
- `{{risksHtml}}` — リスク要因のHTML
- `{{hasSma200}}` — SMA200表示フラグ

既存の mockup.html を Read して、ハードコードされた部分を特定し、プレースホルダーに置換する。CSSとChart.js設定はそのまま維持。

- [ ] **Step 2: ブラウザでプレースホルダーが壊れていないか確認（手動）**

- [ ] **Step 3: コミット**

```bash
git add src/skills/pdf-report/templates/report.html
git commit -m "feat(pdf-report): create production HTML template with placeholders"
```

---

### Task 12: PDF生成ロジック（generate.ts）

**Files:**
- Create: `src/skills/pdf-report/generate.ts`
- Create: `src/skills/pdf-report/__tests__/generate.test.ts`

- [ ] **Step 1: 統合テストを書く**

```typescript
// src/skills/pdf-report/__tests__/generate.test.ts
import { describe, test, expect } from 'vitest';
import { generateReport } from '../generate.js';
import type { ReportInput } from '../generate.js';
import { existsSync, unlinkSync } from 'fs';

const sampleInput: ReportInput = {
  code: '7203',
  name: 'トヨタ自動車',
  sector: '輸送用機器',
  market: '東証プライム',
  price: 2530,
  marketCap: 412000, // 億円
  analysisDate: '2026-04-04',
  scores: {
    valuation: 72, profitability: 85, growth: 45,
    safety: 78, trend: 68, supplyDemand: 62, shareholderReturn: 75,
  },
  industryAvg: {
    valuation: 50, profitability: 60, growth: 55,
    safety: 65, trend: 50, supplyDemand: 50, shareholderReturn: 55,
  },
  details: {
    valuation: 'DCF理論株価: 2,850円（現在比+12.6%）。PER 15倍（業界平均20倍 → 割安）。PBR 1.2倍（前年1.4倍 → 改善）。',
    profitability: 'ROE 18.2%（業界平均12.5% → 上回る）。営業利益率9.8%（前年8.5% → 改善）。',
    growth: '売上成長率3.2%（業界平均5.8% → 下回る）。EPS成長率2.1%（前年8.5% → 鈍化）。',
    safety: 'Altman Z\'\' 3.2（安全圏）。自己資本比率52%（前年50% → 改善）。',
    trend: 'SEPA S2（上昇初期）。ダウ理論: 上昇。グランビル: B2（押し目買い）。',
    supplyDemand: '信用倍率3.1倍（良好）。出来高20日平均比+15%。',
    shareholderReturn: '配当利回り2.8%。増配率+8%/年（加速）。配当性向32%。自社株買い実績あり。',
  },
  summary: 'トヨタ自動車は稼ぐ力（ROE 18.2%）と安全性で業界を大きく上回る。割安度もDCFベースで+12.6%の上昇余地がある。一方で成長性は業界平均を下回り、EV転換期の投資負担が重い。還元力は連続増配と自社株買いで高水準を維持。総合的にはやや強気だが、成長性の回復がカギ。',
  risks: [
    { title: 'EV転換コストの長期化', description: 'BEV競争の激化によりHEV依存の現行モデルがリスク。' },
    { title: '円高リスク', description: '1円の円高で約400億円の営業利益への影響。' },
  ],
  priceData: Array.from({ length: 60 }, (_, i) => {
    const d = new Date(2026, 0, 6 + i); // 2026-01-06 から営業日を模擬
    return {
      date: d.toISOString().slice(0, 10),
      close: 2400 + i * 3.3,          // 決定的な値（ランダム不使用）
      volume: 10000000 + i * 100000,
      sma50: 2450 + i * 0.5,
    };
  }),
};

describe('generateReport', () => {
  test('generates a PDF file', async () => {
    const outputPath = await generateReport(sampleInput);
    expect(outputPath).toContain('7203_report_2026-04-04.pdf');
    expect(existsSync(outputPath)).toBe(true);
    // cleanup
    unlinkSync(outputPath);
  }, 30000); // PDF生成は時間がかかるため30秒タイムアウト
});
```

- [ ] **Step 2: テスト実行 → 失敗確認**

- [ ] **Step 3: generate.ts を実装**

```typescript
// src/skills/pdf-report/generate.ts
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import type { SevenAxisScores } from './scores.js';

export interface ReportInput {
  code: string;
  name: string;
  sector: string;
  market: string;
  price: number;
  marketCap: number;
  analysisDate: string;
  scores: SevenAxisScores;
  industryAvg: SevenAxisScores;
  details: Record<keyof SevenAxisScores, string>;
  summary: string;
  risks: Array<{ title: string; description: string }>;
  priceData: Array<{
    date: string;
    close: number;
    volume: number;
    sma50?: number;
    sma200?: number;
  }>;
}

export async function generateReport(input: ReportInput): Promise<string> {
  const templatePath = resolve(dirname(import.meta.path), 'templates', 'report.html');
  let html = readFileSync(templatePath, 'utf-8');

  // JQUANTS_PLAN で SMA200 表示を判定
  const plan = process.env.JQUANTS_PLAN ?? 'free';
  const hasSma200 = plan !== 'free' && input.priceData.some(d => d.sma200 !== undefined);

  // プレースホルダーを置換（HTMLエスケープ付き）
  html = html
    .replace('{{companyName}}', escapeHtml(input.name))
    .replace('{{code}}', escapeHtml(input.code))
    .replace('{{sector}}', escapeHtml(input.sector))
    .replace('{{market}}', escapeHtml(input.market))
    .replace('{{price}}', input.price.toLocaleString())
    .replace('{{marketCap}}', formatMarketCap(input.marketCap))
    .replace('{{analysisDate}}', input.analysisDate)
    .replace('{{scoresJson}}', JSON.stringify(input.scores))
    .replace('{{industryAvgJson}}', JSON.stringify(input.industryAvg))
    .replace('{{summaryComment}}', escapeHtml(input.summary))
    .replace('{{detailCards}}', buildDetailCards(input))
    .replace('{{priceDataJson}}', JSON.stringify(input.priceData))
    .replace('{{risksHtml}}', buildRisksHtml(input.risks))
    .replace('{{hasSma200}}', String(hasSma200));

  // output ディレクトリ作成
  const outputDir = resolve(process.cwd(), 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, `${input.code}_report_${input.analysisDate}.pdf`);

  // Playwright でPDF化
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  // Chart.js の読み込み完了を待機
  await page.waitForFunction(() => typeof (window as any).Chart !== 'undefined', { timeout: 10000 });
  await page.pdf({ path: outputPath, format: 'A4', printBackground: true });
  await browser.close();

  return outputPath;
}

/** HTMLエスケープ */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMarketCap(billionYen: number): string {
  if (billionYen >= 10000) return `${(billionYen / 10000).toFixed(1)}兆円`;
  return `${billionYen.toLocaleString()}億円`;
}

function buildDetailCards(input: ReportInput): string {
  const axisNames: Record<keyof SevenAxisScores, string> = {
    valuation: '割安度',
    profitability: '稼ぐ力',
    growth: '成長性',
    safety: '安全性',
    trend: 'トレンド',
    supplyDemand: '需給',
    shareholderReturn: '還元力',
  };

  return (Object.keys(axisNames) as (keyof SevenAxisScores)[])
    .map((key) => {
      const score = input.scores[key];
      const avg = input.industryAvg[key];
      const colorClass = score >= avg ? 'above-avg' : 'below-avg';
      return `
        <div class="detail-card">
          <div class="detail-header">
            <span class="axis-name">${axisNames[key]}</span>
            <span class="axis-score ${colorClass}">${score}/100</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar ${colorClass}" style="width: ${score}%"></div>
            <div class="avg-marker" style="left: ${avg}%"></div>
          </div>
          <div class="detail-text">${escapeHtml(input.details[key])}</div>
        </div>`;
    })
    .join('\n');
}

function buildRisksHtml(risks: Array<{ title: string; description: string }>): string {
  return risks
    .map(r => `<li><strong>${escapeHtml(r.title)}:</strong> ${escapeHtml(r.description)}</li>`)
    .join('\n');
}
```

- [ ] **Step 4: テスト実行 → パス確認**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test src/skills/pdf-report/__tests__/generate.test.ts`
Expected: PASS（PDFファイルが生成される）

- [ ] **Step 5: コミット**

```bash
git add src/skills/pdf-report/generate.ts src/skills/pdf-report/__tests__/generate.test.ts
git commit -m "feat(pdf-report): implement PDF generation with Playwright"
```

---

### Task 13: SKILL.md の作成

**Files:**
- Create: `src/skills/pdf-report/SKILL.md`

- [ ] **Step 1: SKILL.md を作成**

```markdown
---
name: pdf-report
description: 総合分析結果をビジュアルPDFレポートとして出力する。レーダーチャートと横棒グラフで7軸スコアを可視化し、初心者にもわかりやすい形式で提供。「レポート出して」「PDF出して」「レポートにして」のように分析結果のレポート化を求められたときに使用。
---

# PDFレポート出力 Skill

総合分析（comprehensive-analysis）の結果をビジュアルPDFレポートとして出力する。

## 前提条件

- 総合分析が完了していること（分析データが存在すること）
- 分析データがない場合は「先に分析を実行してください」と案内する

## Workflow

1. 総合分析の各フェーズの結果を収集
2. `scores.ts` で7軸スコア（0〜100）に変換
3. 業界平均を `screen_stocks` で取得（取得不可時はデフォルト50）
4. `generate.ts` でHTMLテンプレートにデータ注入 → PlaywrightでPDF化
5. `output/{code}_report_{date}.pdf` に保存
6. ユーザーに出力パスを伝える

## 7軸スコア

| 軸 | 内容 |
|---|---|
| 割安度 | DCF乖離率・PER・PBR・ネットネット |
| 稼ぐ力 | ROE・営業利益率・ROA |
| 成長性 | 売上CAGR・EPS成長率・PEG |
| 安全性 | Altman Z''・自己資本比率 |
| トレンド | SEPA・ダウ理論・グランビル |
| 需給 | 信用倍率・出来高・モンテカルロ |
| 還元力 | 配当利回り・増配率・配当性向・DOE・自社株買い・総還元性向 |

## デザイン

- デジタル庁ダッシュボードガイド準拠
- 参考: https://www.digital.go.jp/resources/dashboard-guidebook
- 閾値・ウェイト詳細: `docs/specs/2026-04-04-pdf-report-design.md`
```

- [ ] **Step 2: コミット**

```bash
git add src/skills/pdf-report/SKILL.md
git commit -m "feat(pdf-report): add SKILL.md definition"
```

---

### Task 14: CLAUDE.md と comprehensive-analysis の統合

**Files:**
- Modify: `CLAUDE.md`
- Modify: `src/skills/comprehensive-analysis/SKILL.md`
- Modify: `.gitignore`

- [ ] **Step 1: CLAUDE.md にスキル対応表エントリを追加**

スキル対応表に以下を追加:

```
| 「レポート出して」「PDF出して」 | `src/skills/pdf-report/SKILL.md` |
```

- [ ] **Step 2: comprehensive-analysis/SKILL.md の Phase 7 末尾（「実行時の注意」セクションの直前）に追記**

Phase 7 の出力フォーマット定義（`━━━` 区切り行の後、`## 実行時の注意` の前）に以下を追記:

```markdown
## Phase 8: PDFレポート提案（任意）

Phase 7 の出力が完了したら、以下のように確認する:

「PDFレポートも出力しますか？レーダーチャート付きのビジュアルレポートを生成できます。」

ユーザーが希望した場合、`pdf-report` スキルを呼び出す。
```

- [ ] **Step 3: .gitignore に output/ を追加**

```
output/
```

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md src/skills/comprehensive-analysis/SKILL.md .gitignore
git commit -m "feat(pdf-report): integrate with comprehensive analysis and CLAUDE.md routing"
```

---

### Task 15: README にPDFレポート機能を追記

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README.md に機能説明を追加**

「## 特徴」セクションに追記:
```markdown
- **PDFレポート出力**: レーダーチャート付きのビジュアル分析レポートをPDF出力。デジタル庁ダッシュボードガイド準拠のデザイン
```

「### 使い方」セクションに追記:
```markdown
> トヨタを分析して
→ ... （既存の説明）

> レポート出して
→ 分析結果をレーダーチャート付きPDFレポートとして出力
```

「## デザインガイドライン」セクションを新設:
```markdown
## デザインガイドライン

PDFレポートのデザインは[デジタル庁ダッシュボードデザインの実践ガイドブック](https://www.digital.go.jp/resources/dashboard-guidebook)に準拠しています。
```

- [ ] **Step 2: コミット**

```bash
git add README.md
git commit -m "docs: add PDF report feature and design guideline to README"
```

---

### Task 16: 全テスト実行と最終確認

**Files:** なし（確認のみ）

- [ ] **Step 1: 全テスト実行**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun test`
Expected: ALL PASS

- [ ] **Step 2: 型チェック**

Run: `cd /Users/okahiroyuki/kabu-dexter && bun run typecheck`
Expected: PASS（エラーなし）

- [ ] **Step 3: PDF生成の手動確認**

サンプルデータでPDFを生成し、ブラウザで開いて目視確認:
- レーダーチャートが7軸で描画されているか
- 業界平均の比較線が表示されているか
- 横棒グラフの正/負が正しく色分けされているか
- 株価チャートが表示されているか
- フッターの免責事項が表示されているか

- [ ] **Step 4: 最終コミット（必要に応じて修正）**
