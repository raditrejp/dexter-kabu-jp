import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { SignalTracker } from '../tracker.js';
import type { ISQScore } from '../isq.js';

describe('SignalTracker', () => {
  let tracker: SignalTracker;

  beforeEach(async () => {
    // Use in-memory SQLite for tests
    tracker = await SignalTracker.create(':memory:');
  });

  afterEach(() => {
    tracker.close();
  });

  const makeScore = (overrides: Partial<ISQScore> = {}): ISQScore => ({
    score: 0.7,
    direction: 1,
    signal: 0.7,
    label: '中シグナル',
    ...overrides,
  });

  test('save and retrieve a signal', () => {
    tracker.save({
      symbol: '7203',
      date: '2026-03-28',
      isqScore: makeScore(),
    });

    const latest = tracker.getLatest('7203');
    expect(latest).not.toBeNull();
    expect(latest!.symbol).toBe('7203');
    expect(latest!.date).toBe('2026-03-28');
    expect(latest!.isqScore.score).toBe(0.7);
    expect(latest!.isqScore.direction).toBe(1);
    expect(latest!.isqScore.label).toBe('中シグナル');
    expect(latest!.transmission).toBeUndefined();
  });

  test('save with transmission chain', () => {
    tracker.save({
      symbol: '8306',
      date: '2026-03-28',
      isqScore: makeScore(),
      transmission: {
        nodes: [
          { name: '日銀利上げ', level: 'macro', impactType: 'negative', logic: '短期金利上昇' },
          { name: '銀行業', level: 'sector', impactType: 'positive', logic: '利ザヤ拡大' },
        ],
        summary: '日銀利上げ→銀行業に追い風',
      },
    });

    const latest = tracker.getLatest('8306');
    expect(latest!.transmission).toBeDefined();
    expect(latest!.transmission!.nodes).toHaveLength(2);
    expect(latest!.transmission!.summary).toBe('日銀利上げ→銀行業に追い風');
  });

  test('getLatest returns most recent by date', () => {
    tracker.save({ symbol: '7203', date: '2026-03-01', isqScore: makeScore({ score: 0.5 }) });
    tracker.save({ symbol: '7203', date: '2026-03-28', isqScore: makeScore({ score: 0.8 }) });

    const latest = tracker.getLatest('7203');
    expect(latest!.isqScore.score).toBe(0.8);
  });

  test('getLatest returns null for unknown symbol', () => {
    expect(tracker.getLatest('9999')).toBeNull();
  });

  test('compare: strengthened when score increases > 0.1', () => {
    tracker.save({ symbol: '7203', date: '2026-03-01', isqScore: makeScore({ score: 0.5 }) });

    const newScore = makeScore({ score: 0.7 }); // diff = +0.2
    expect(tracker.compare('7203', newScore)).toBe('strengthened');
  });

  test('compare: weakened when score decreases > 0.1', () => {
    tracker.save({ symbol: '7203', date: '2026-03-01', isqScore: makeScore({ score: 0.7 }) });

    const newScore = makeScore({ score: 0.5 }); // diff = -0.2
    expect(tracker.compare('7203', newScore)).toBe('weakened');
  });

  test('compare: falsified when direction flips', () => {
    tracker.save({
      symbol: '7203',
      date: '2026-03-01',
      isqScore: makeScore({ score: 0.7, direction: 1, signal: 0.7 }),
    });

    const newScore = makeScore({ score: 0.6, direction: -1, signal: -0.6 });
    expect(tracker.compare('7203', newScore)).toBe('falsified');
  });

  test('compare: unchanged when diff <= 0.1', () => {
    tracker.save({ symbol: '7203', date: '2026-03-01', isqScore: makeScore({ score: 0.7 }) });

    const newScore = makeScore({ score: 0.75 }); // diff = +0.05
    expect(tracker.compare('7203', newScore)).toBe('unchanged');
  });

  test('compare: unchanged for unknown symbol (no previous data)', () => {
    const newScore = makeScore({ score: 0.5 });
    expect(tracker.compare('9999', newScore)).toBe('unchanged');
  });
});
