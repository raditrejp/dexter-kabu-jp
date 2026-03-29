/**
 * ISQ (Investment Signal Quality) framework.
 *
 * Pure scoring logic — no external calls.  Takes a raw signal
 * (sentiment, confidence, intensity, expectation-gap, timeliness)
 * and produces a normalised ISQScore.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface ISQSignal {
  /** Direction: -1.0 (bearish) to +1.0 (bullish) */
  sentiment: number;
  /** How confident are we in the signal: 0.0 – 1.0 */
  confidence: number;
  /** Strength / magnitude: 1 – 5 */
  intensity: number;
  /** Market mispricing opportunity: 0.0 – 1.0 */
  expectationGap: number;
  /** How time-sensitive is the signal: 0.0 – 1.0 */
  timeliness: number;
}

export interface ISQScore {
  /** Magnitude of the signal: 0.0 – 1.0 */
  score: number;
  /** Direction derived from sentiment sign */
  direction: 1 | -1;
  /** Signed score: direction × score */
  signal: number;
  /** Human-readable label */
  label: string;
}

// ── Weights ──────────────────────────────────────────────────────────

const W_CONFIDENCE = 0.35;
const W_INTENSITY = 0.30;
const W_GAP = 0.20;
const W_TIMELINESS = 0.15;

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function labelFromScore(score: number): string {
  if (score >= 0.8) return '強シグナル';
  if (score >= 0.6) return '中シグナル';
  if (score >= 0.4) return '弱シグナル';
  return 'ノイズ';
}

// ── Public API ───────────────────────────────────────────────────────

export function calculateISQScore(signal: ISQSignal): ISQScore {
  const confidence = clamp(signal.confidence, 0, 1);
  const intensity = clamp(signal.intensity, 1, 5);
  const gap = clamp(signal.expectationGap, 0, 1);
  const timeliness = clamp(signal.timeliness, 0, 1);

  const score =
    confidence * W_CONFIDENCE +
    (intensity / 5) * W_INTENSITY +
    gap * W_GAP +
    timeliness * W_TIMELINESS;

  const direction: 1 | -1 = signal.sentiment >= 0 ? 1 : -1;

  return {
    score: Math.round(score * 1000) / 1000,   // 3-decimal precision
    direction,
    signal: Math.round(direction * score * 1000) / 1000,
    label: labelFromScore(score),
  };
}
