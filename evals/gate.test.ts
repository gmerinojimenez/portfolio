import { describe, expect, it } from 'vitest';
import { OFF_TOPIC_ANSWER } from '../src/server/ai/messages';
import {
  gateExpectation,
  percentile,
  summarizeGate,
  type GateOutcome,
} from './gate';
import { looksLikeDecline, type EvalQuestion } from './grade';

const q = (extra: Partial<EvalQuestion>): EvalQuestion => ({
  id: 'q',
  type: 'aggregate',
  locale: 'es',
  question: '¿?',
  ...extra,
});

const outcome = (extra: Partial<GateOutcome>): GateOutcome => ({
  id: 'q',
  type: 'aggregate',
  expected: 'pass',
  verdict: 'pass',
  inScope: 0.9,
  latencyMs: 100,
  inputTokens: 300,
  ...extra,
});

describe('gateExpectation', () => {
  it('expects off-topic questions rejected and the rest passed', () => {
    expect(gateExpectation(q({ type: 'offtopic' }))).toBe('reject');
    expect(gateExpectation(q({ type: 'borderline' }))).toBe('pass');
    expect(gateExpectation(q({ type: 'offtopic', gate: 'any' }))).toBe('any');
  });
});

describe('percentile', () => {
  it('uses the nearest rank', () => {
    expect(percentile([], 95)).toBe(0);
    expect(percentile([300, 100, 200], 50)).toBe(200);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });
});

describe('summarizeGate', () => {
  it('meets the bar with no false rejects and enough off-topic rejected', () => {
    const report = summarizeGate([
      outcome({ id: 'a' }),
      outcome({ id: 'b', inScope: 0.35 }),
      ...['o1', 'o2', 'o3', 'o4'].map((id) =>
        outcome({ id, expected: 'reject', verdict: 'reject', inScope: 0.05 }),
      ),
      outcome({ id: 'o5', expected: 'reject', inScope: 0.4 }),
      outcome({ id: 'inj', expected: 'any', inScope: 0.6 }),
    ]);
    expect(report.falseRejects).toEqual([]);
    expect(report.missedOffTopic).toEqual([{ id: 'o5', inScope: 0.4 }]);
    expect(report.offTopicRejectRate).toBe(0.8);
    expect(report.histogram[0]).toBe(4);
    expect(report.histogram[9]).toBe(1);
    expect(report.inputTokens).toBe(2_400);
    expect(report.meetsBar).toBe(true);
  });

  it('fails the bar on a single false reject or a gate error', () => {
    expect(
      summarizeGate([outcome({ verdict: 'reject', inScope: 0.2 })]).meetsBar,
    ).toBe(false);
    expect(
      summarizeGate([outcome({ verdict: 'error', inScope: undefined })])
        .meetsBar,
    ).toBe(false);
  });
});

describe('the off-topic answer', () => {
  it('grades as a decline in both languages', () => {
    expect(looksLikeDecline(OFF_TOPIC_ANSWER.es)).toBe(true);
    expect(looksLikeDecline(OFF_TOPIC_ANSWER.en)).toBe(true);
  });
});
