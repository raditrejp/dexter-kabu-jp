import { describe, test, expect } from 'vitest';
import { Evaluator } from '../evaluator.js';

// ── shouldEvaluate ───────────────────────────────────────────────────

describe('Evaluator.shouldEvaluate', () => {
  test('returns true for analysis queries (Japanese)', () => {
    expect(Evaluator.shouldEvaluate('7203を分析して')).toBe(true);
    expect(Evaluator.shouldEvaluate('この銘柄の評価をお願い')).toBe(true);
    expect(Evaluator.shouldEvaluate('DCFで理論株価を出して')).toBe(true);
    expect(Evaluator.shouldEvaluate('SEPAチェックして')).toBe(true);
    expect(Evaluator.shouldEvaluate('スクリーニングして')).toBe(true);
    expect(Evaluator.shouldEvaluate('投資判断を教えて')).toBe(true);
    expect(Evaluator.shouldEvaluate('どう思う？')).toBe(true);
  });

  test('returns true for analysis queries (English)', () => {
    expect(Evaluator.shouldEvaluate('analyze this stock')).toBe(true);
  });

  test('returns false for simple fact queries', () => {
    expect(Evaluator.shouldEvaluate('今日の天気は？')).toBe(false);
    expect(Evaluator.shouldEvaluate('こんにちは')).toBe(false);
    expect(Evaluator.shouldEvaluate('トヨタの株価は？')).toBe(false);
    expect(Evaluator.shouldEvaluate('help')).toBe(false);
  });
});

// ── buildEvaluationPrompt ────────────────────────────────────────────

describe('Evaluator.buildEvaluationPrompt', () => {
  test('includes query, analysis text, and tool results', () => {
    const prompt = Evaluator.buildEvaluationPrompt(
      '7203を分析して',
      'テクニカル: 買いシグナル',
      'RSI=65, MACD=positive',
    );

    expect(prompt).toContain('7203を分析して');
    expect(prompt).toContain('テクニカル: 買いシグナル');
    expect(prompt).toContain('RSI=65');
    expect(prompt).toContain('dataSufficiency');
    expect(prompt).toContain('consistency');
    expect(prompt).toContain('insight');
    expect(prompt).toContain('actionability');
  });

  test('truncates long tool results', () => {
    const longResults = 'x'.repeat(5000);
    const prompt = Evaluator.buildEvaluationPrompt('query', 'analysis', longResults);
    // Should contain at most 3000 chars of tool results
    expect(prompt.length).toBeLessThan(longResults.length);
  });
});

// ── parseEvaluationResponse ──────────────────────────────────────────

describe('Evaluator.parseEvaluationResponse', () => {
  test('parses valid JSON response', () => {
    const response = `\`\`\`json
{
  "dataSufficiency": 4,
  "consistency": 5,
  "insight": 3,
  "actionability": 4,
  "feedback": ""
}
\`\`\``;

    const result = Evaluator.parseEvaluationResponse(response);
    expect(result.pass).toBe(true);
    expect(result.scores.dataSufficiency).toBe(4);
    expect(result.scores.consistency).toBe(5);
    expect(result.scores.insight).toBe(3);
    expect(result.scores.actionability).toBe(4);
    expect(result.overall).toBe(4.0);
    expect(result.feedback).toBe('');
  });

  test('parses failing evaluation (overall < 3)', () => {
    const response = JSON.stringify({
      dataSufficiency: 2,
      consistency: 1,
      insight: 2,
      actionability: 1,
      feedback: 'データが大幅に不足しています',
    });

    const result = Evaluator.parseEvaluationResponse(response);
    expect(result.pass).toBe(false);
    expect(result.overall).toBe(1.5);
    expect(result.feedback).toBe('データが大幅に不足しています');
  });

  test('clamps scores to 1-5 range', () => {
    const response = JSON.stringify({
      dataSufficiency: 0,
      consistency: 10,
      insight: -1,
      actionability: 6,
      feedback: '',
    });

    const result = Evaluator.parseEvaluationResponse(response);
    expect(result.scores.dataSufficiency).toBe(1);
    expect(result.scores.consistency).toBe(5);
    expect(result.scores.insight).toBe(1);
    expect(result.scores.actionability).toBe(5);
  });

  test('returns default pass when JSON parsing fails', () => {
    const result = Evaluator.parseEvaluationResponse('this is not json at all');
    expect(result.pass).toBe(true);
    expect(result.overall).toBe(3.0);
  });

  test('handles missing fields gracefully', () => {
    const response = JSON.stringify({ dataSufficiency: 5 });
    const result = Evaluator.parseEvaluationResponse(response);
    // Missing fields default to 3
    expect(result.scores.consistency).toBe(3);
    expect(result.scores.insight).toBe(3);
    expect(result.scores.actionability).toBe(3);
  });
});
