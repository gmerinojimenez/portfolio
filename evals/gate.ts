/**
 * Scope gate eval (S17): what each question should get from the gate, and the
 * report that decides whether the gate can move to `enforce`. Pure, tested in
 * gate.test.ts; run.ts calls the real gate.
 */
import type { EvalQuestion } from './grade';

export type GateExpectation = 'pass' | 'reject' | 'any';

/** The spec's bar: at least this share of clear off-topic questions rejected. */
export const MIN_OFFTOPIC_REJECT_RATE = 0.8;

export const gateExpectation = (q: EvalQuestion): GateExpectation =>
  q.gate ?? (q.type === 'offtopic' ? 'reject' : 'pass');

export interface GateOutcome {
  id: string;
  type: string;
  expected: GateExpectation;
  verdict: 'pass' | 'reject' | 'error';
  inScope?: number;
  reason?: string;
  latencyMs: number;
  inputTokens: number;
}

/** Nearest-rank percentile; 0 for no values. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}

export interface GateReport {
  total: number;
  /** In-scope questions the gate rejected: must be none. */
  falseRejects: { id: string; inScope?: number }[];
  /** Off-topic questions expected to be rejected that passed. */
  missedOffTopic: { id: string; inScope?: number }[];
  offTopicRejectRate: number;
  errors: { id: string; reason?: string }[];
  /** Count of `inScope` scores per tenth: index 0 is [0, 0.1). */
  histogram: number[];
  latencyP50Ms: number;
  latencyP95Ms: number;
  inputTokens: number;
  /** True when it meets the spec's bar to move to `enforce`. */
  meetsBar: boolean;
}

export function summarizeGate(outcomes: GateOutcome[]): GateReport {
  const falseRejects = outcomes
    .filter((o) => o.expected === 'pass' && o.verdict === 'reject')
    .map((o) => ({ id: o.id, inScope: o.inScope }));
  const shouldReject = outcomes.filter((o) => o.expected === 'reject');
  const missedOffTopic = shouldReject
    .filter((o) => o.verdict !== 'reject')
    .map((o) => ({ id: o.id, inScope: o.inScope }));
  const offTopicRejectRate = shouldReject.length
    ? (shouldReject.length - missedOffTopic.length) / shouldReject.length
    : 1;
  const errors = outcomes
    .filter((o) => o.verdict === 'error')
    .map((o) => ({ id: o.id, reason: o.reason }));
  const histogram = Array.from({ length: 10 }, () => 0);
  for (const o of outcomes) {
    if (o.inScope === undefined) continue;
    histogram[Math.min(9, Math.floor(o.inScope * 10))]! += 1;
  }
  const latencies = outcomes.map((o) => o.latencyMs);
  return {
    total: outcomes.length,
    falseRejects,
    missedOffTopic,
    offTopicRejectRate,
    errors,
    histogram,
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    inputTokens: outcomes.reduce((sum, o) => sum + o.inputTokens, 0),
    meetsBar:
      falseRejects.length === 0 &&
      errors.length === 0 &&
      offTopicRejectRate >= MIN_OFFTOPIC_REJECT_RATE,
  };
}
