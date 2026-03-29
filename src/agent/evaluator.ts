/**
 * Independent Evaluator — runs in a separate LLM context (no tools bound)
 * to verify analysis quality across 4 axes.
 */

import { callLlm } from '../model/llm.js';

// ── Types ────────────────────────────────────────────────────────────

export interface EvaluationResult {
  pass: boolean;
  scores: {
    dataSufficiency: number;  // 1-5
    consistency: number;       // 1-5
    insight: number;           // 1-5
    actionability: number;     // 1-5
  };
  overall: number;  // average of 4 scores
  feedback: string; // specific feedback if fail
}

// ── Analysis keywords that trigger evaluation ────────────────────────

const ANALYSIS_KEYWORDS = [
  '分析', 'analyze', '評価', '判断', '診断',
  'どう思う', '投資', 'DCF', 'SEPA', 'スクリーニング',
];

// ── Evaluator ────────────────────────────────────────────────────────

export class Evaluator {
  private readonly model: string;

  constructor(model?: string) {
    this.model = model ?? 'gpt-5.4';
  }

  /**
   * Heuristic: skip evaluation for simple fact queries.
   * Returns true if the query contains analysis-related keywords.
   */
  static shouldEvaluate(query: string): boolean {
    const lower = query.toLowerCase();
    return ANALYSIS_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  }

  /**
   * Run evaluation in a separate LLM context (no tools bound).
   */
  async evaluate(
    query: string,
    analysisText: string,
    toolResults: string,
  ): Promise<EvaluationResult> {
    const prompt = Evaluator.buildEvaluationPrompt(query, analysisText, toolResults);

    const result = await callLlm(prompt, {
      model: this.model,
      systemPrompt: EVALUATION_SYSTEM_PROMPT,
      // No tools — pure evaluation context
    });

    const responseText = typeof result.response === 'string'
      ? result.response
      : (result.response as { content: string }).content ?? '';

    return Evaluator.parseEvaluationResponse(responseText);
  }

  /**
   * Build the evaluation prompt with the 4-axis rubric.
   * Exported as static for testing.
   */
  static buildEvaluationPrompt(
    query: string,
    analysisText: string,
    toolResults: string,
  ): string {
    return `あなたは投資分析レポートの品質評価者です。以下の分析結果を4つの軸で評価してください。

## ユーザーの質問
${query}

## ツール取得データ（要約）
${toolResults.slice(0, 3000)}

## 分析レポート
${analysisText}

## 評価基準（各1-5点）

1. **データ充足度 (dataSufficiency)**: 分析に必要なデータが十分に取得・活用されているか
   - 5: 全必要データ取得済み、漏れなし
   - 3: 主要データはあるが一部欠損
   - 1: 重大なデータ欠損あり

2. **整合性 (consistency)**: 各セクション間で矛盾がないか
   - 5: 完全に整合的
   - 3: 軽微な不整合あり
   - 1: 重大な矛盾あり

3. **洞察の深さ (insight)**: 数値の羅列ではなく、意味のある分析がされているか
   - 5: 深い洞察・独自の視点あり
   - 3: 標準的な分析
   - 1: 数値の転記のみ

4. **行動指針の明確さ (actionability)**: 読者が次に何をすべきか明確か
   - 5: 具体的な条件付きアクションプラン
   - 3: 方向性は示されている
   - 1: 曖昧・判断丸投げ

## 回答フォーマット（厳守）

以下のJSON形式で回答してください。JSON以外の文章は含めないでください。

\`\`\`json
{
  "dataSufficiency": <1-5>,
  "consistency": <1-5>,
  "insight": <1-5>,
  "actionability": <1-5>,
  "feedback": "<不合格の場合の具体的改善指示。合格なら空文字>"
}
\`\`\``;
  }

  /**
   * Parse the LLM's evaluation response into an EvaluationResult.
   */
  static parseEvaluationResponse(response: string): EvaluationResult {
    try {
      // Extract JSON from response (may be wrapped in markdown code fence)
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]) as {
        dataSufficiency?: number;
        consistency?: number;
        insight?: number;
        actionability?: number;
        feedback?: string;
      };

      const scores = {
        dataSufficiency: clampScore(parsed.dataSufficiency ?? 3),
        consistency: clampScore(parsed.consistency ?? 3),
        insight: clampScore(parsed.insight ?? 3),
        actionability: clampScore(parsed.actionability ?? 3),
      };

      const overall = (
        scores.dataSufficiency +
        scores.consistency +
        scores.insight +
        scores.actionability
      ) / 4;

      return {
        pass: overall >= 3.0,
        scores,
        overall: Math.round(overall * 100) / 100,
        feedback: parsed.feedback ?? '',
      };
    } catch {
      // If parsing fails, return a default pass to avoid blocking the user
      return {
        pass: true,
        scores: { dataSufficiency: 3, consistency: 3, insight: 3, actionability: 3 },
        overall: 3.0,
        feedback: '',
      };
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function clampScore(v: number): number {
  return Math.max(1, Math.min(5, Math.round(v)));
}

const EVALUATION_SYSTEM_PROMPT = `あなたは投資分析レポートの独立評価者です。
与えられた分析レポートを客観的に評価し、指定されたJSON形式で回答してください。
評価は厳格に行い、データ不足や矛盾があれば率直に指摘してください。
投資助言は行わず、分析の品質のみを評価します。`;
