/**
 * Transmission chain — structured representation of how an event
 * propagates through macro → sector → stock levels.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface TransmissionNode {
  /** Descriptive name, e.g. "日銀利上げ" */
  name: string;
  /** Impact level in the chain */
  level: 'macro' | 'sector' | 'stock';
  /** Qualitative direction */
  impactType: 'positive' | 'negative' | 'neutral';
  /** Human-readable reasoning for this node */
  logic: string;
}

export interface TransmissionChain {
  /** Ordered list of nodes from cause to effect */
  nodes: TransmissionNode[];
  /** One-liner summarising the full chain */
  summary: string;
}

// ── Formatting ───────────────────────────────────────────────────────

const IMPACT_ICON: Record<TransmissionNode['impactType'], string> = {
  positive: '🟢',
  negative: '🔴',
  neutral: '⚪',
};

const LEVEL_LABEL: Record<TransmissionNode['level'], string> = {
  macro: 'マクロ',
  sector: 'セクター',
  stock: '個別株',
};

/**
 * Pretty-print a transmission chain as a readable string.
 *
 * Example output:
 * ```
 * 【波及チェーン】日銀利上げ→金融セクター
 * [マクロ] 🔴 日銀利上げ — 短期金利上昇で…
 *   → [セクター] 🟢 銀行業 — 利ザヤ拡大で…
 *   → [個別株] 🟢 8306 三菱UFJFG — …
 * ```
 */
export function formatTransmissionChain(chain: TransmissionChain): string {
  if (chain.nodes.length === 0) return '（波及チェーンなし）';

  const lines: string[] = [`【波及チェーン】${chain.summary}`];

  chain.nodes.forEach((node, i) => {
    const prefix = i === 0 ? '' : '  → ';
    const icon = IMPACT_ICON[node.impactType];
    const level = LEVEL_LABEL[node.level];
    lines.push(`${prefix}[${level}] ${icon} ${node.name} — ${node.logic}`);
  });

  return lines.join('\n');
}
