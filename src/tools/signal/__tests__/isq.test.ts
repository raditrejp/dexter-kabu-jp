import { describe, test, expect } from 'vitest';
import { calculateISQScore, type ISQSignal } from '../isq.js';

describe('calculateISQScore', () => {
  test('computes known values correctly', () => {
    const signal: ISQSignal = {
      sentiment: 0.7,
      confidence: 0.8,
      intensity: 4,
      expectationGap: 0.6,
      timeliness: 0.5,
    };

    const result = calculateISQScore(signal);

    // score = 0.8*0.35 + (4/5)*0.30 + 0.6*0.20 + 0.5*0.15
    //       = 0.28     + 0.24       + 0.12      + 0.075
    //       = 0.715
    expect(result.score).toBeCloseTo(0.715, 3);
    expect(result.direction).toBe(1);
    expect(result.signal).toBeCloseTo(0.715, 3);
    expect(result.label).toBe('中シグナル');
  });

  test('negative sentiment produces direction -1', () => {
    const signal: ISQSignal = {
      sentiment: -0.5,
      confidence: 0.6,
      intensity: 3,
      expectationGap: 0.4,
      timeliness: 0.3,
    };

    const result = calculateISQScore(signal);

    expect(result.direction).toBe(-1);
    expect(result.signal).toBeLessThan(0);
    expect(result.signal).toBeCloseTo(-result.score, 3);
  });

  test('sentiment zero is treated as positive direction', () => {
    const signal: ISQSignal = {
      sentiment: 0,
      confidence: 0.5,
      intensity: 3,
      expectationGap: 0.5,
      timeliness: 0.5,
    };

    expect(calculateISQScore(signal).direction).toBe(1);
  });

  test('all-minimum values produce ノイズ label', () => {
    const signal: ISQSignal = {
      sentiment: 0,
      confidence: 0,
      intensity: 1,
      expectationGap: 0,
      timeliness: 0,
    };

    const result = calculateISQScore(signal);

    // score = 0*0.35 + (1/5)*0.30 + 0*0.20 + 0*0.15 = 0.06
    expect(result.score).toBeCloseTo(0.06, 3);
    expect(result.label).toBe('ノイズ');
  });

  test('all-maximum values produce 強シグナル label', () => {
    const signal: ISQSignal = {
      sentiment: 1.0,
      confidence: 1.0,
      intensity: 5,
      expectationGap: 1.0,
      timeliness: 1.0,
    };

    const result = calculateISQScore(signal);

    // score = 1*0.35 + (5/5)*0.30 + 1*0.20 + 1*0.15 = 1.0
    expect(result.score).toBeCloseTo(1.0, 3);
    expect(result.label).toBe('強シグナル');
  });

  test('label thresholds: score >= 0.8 → 強シグナル', () => {
    // Target score ~0.85: confidence=1, intensity=5, gap=1, timeliness=0
    // 1*0.35 + 1*0.30 + 1*0.20 + 0*0.15 = 0.85
    const signal: ISQSignal = {
      sentiment: 1,
      confidence: 1.0,
      intensity: 5,
      expectationGap: 1.0,
      timeliness: 0,
    };
    const result = calculateISQScore(signal);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.label).toBe('強シグナル');
  });

  test('label thresholds: score 0.6 → 中シグナル', () => {
    // Target ~0.6: confidence=0.8, intensity=3, gap=0.5, timeliness=0.2
    // 0.8*0.35 + 0.6*0.30 + 0.5*0.20 + 0.2*0.15 = 0.28+0.18+0.10+0.03 = 0.59
    // Adjust: confidence=0.8, intensity=3, gap=0.6, timeliness=0.2
    // 0.28 + 0.18 + 0.12 + 0.03 = 0.61
    const signal: ISQSignal = {
      sentiment: 1,
      confidence: 0.8,
      intensity: 3,
      expectationGap: 0.6,
      timeliness: 0.2,
    };
    const result = calculateISQScore(signal);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.score).toBeLessThan(0.8);
    expect(result.label).toBe('中シグナル');
  });

  test('label thresholds: score 0.4 → 弱シグナル', () => {
    // confidence=0.5, intensity=2, gap=0.3, timeliness=0.1
    // 0.5*0.35 + 0.4*0.30 + 0.3*0.20 + 0.1*0.15 = 0.175+0.12+0.06+0.015 = 0.37
    // confidence=0.6, intensity=2, gap=0.3, timeliness=0.2
    // 0.21+0.12+0.06+0.03 = 0.42
    const signal: ISQSignal = {
      sentiment: 1,
      confidence: 0.6,
      intensity: 2,
      expectationGap: 0.3,
      timeliness: 0.2,
    };
    const result = calculateISQScore(signal);
    expect(result.score).toBeGreaterThanOrEqual(0.4);
    expect(result.score).toBeLessThan(0.6);
    expect(result.label).toBe('弱シグナル');
  });

  test('clamps out-of-range inputs', () => {
    const signal: ISQSignal = {
      sentiment: 2.0,
      confidence: 1.5,
      intensity: 10,
      expectationGap: 2.0,
      timeliness: -0.5,
    };

    const result = calculateISQScore(signal);

    // Clamped: confidence=1, intensity=5, gap=1, timeliness=0
    // 1*0.35 + 1*0.30 + 1*0.20 + 0*0.15 = 0.85
    expect(result.score).toBeCloseTo(0.85, 3);
    expect(result.direction).toBe(1);
  });
});
