import { describe, expect, it } from 'vitest';
import type { QuestionLogEntry } from '../../src/server/ai/store';
import { formatEntries, logPartitions, parseArgs } from './question-log';

const entry = (over: Partial<QuestionLogEntry> = {}): QuestionLogEntry => ({
  requestId: 'r1',
  at: '2026-11-19T20:17:23.000Z',
  locale: 'en',
  question: 'What has he done\nwith AI?',
  turn: 1,
  answer: 'He built an assistant.',
  sources: ['merlyn-ai-assistant'],
  outcome: 'answered',
  model: 'claude-haiku-5-5',
  inputTokens: 1,
  outputTokens: 1,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  costMicroUsd: 0,
  latencyMs: 0,
  ...over,
});

describe('logPartitions', () => {
  it('lists one partition per day, newest first', () => {
    expect(logPartitions(3, new Date('2026-11-19T01:00:00Z'))).toEqual([
      'log#2026-11-19',
      'log#2026-11-18',
      'log#2026-11-17',
    ]);
  });
});

describe('parseArgs', () => {
  it('defaults to 7 days with short answers', () => {
    expect(parseArgs([])).toEqual({ days: 7, full: false });
  });

  it('reads --days and --full', () => {
    expect(parseArgs(['--days', '30', '--full'])).toEqual({
      days: 30,
      full: true,
    });
  });

  it('rejects days outside the 90-day log', () => {
    expect(() => parseArgs(['--days', '91'])).toThrow();
    expect(() => parseArgs(['--days', 'x'])).toThrow();
  });
});

describe('formatEntries', () => {
  it('sorts oldest first and puts each question on one line', () => {
    const out = formatEntries(
      [entry({ at: '2026-11-19T21:00:00.000Z', question: 'Later' }), entry()],
      { full: false },
    );
    expect(out.indexOf('What has he done with AI?')).toBeLessThan(
      out.indexOf('Later'),
    );
    expect(out).toContain('2026-11-19 20:17 UTC · en · turn 1 · answered');
    expect(out).toContain('sources: merlyn-ai-assistant');
  });

  it('shortens long answers unless --full', () => {
    const answer = 'a'.repeat(300);
    expect(formatEntries([entry({ answer })], { full: false })).not.toContain(
      answer,
    );
    expect(formatEntries([entry({ answer })], { full: true })).toContain(
      answer,
    );
  });

  it('counts questions cut short', () => {
    const out = formatEntries([entry(), entry({ outcome: 'refusal' })], {
      full: false,
    });
    expect(out).toContain(
      '2 questions, 1 cut short (refusal, limit or error).',
    );
  });

  it('says so when there is nothing', () => {
    expect(formatEntries([], { full: false })).toBe(
      'No questions in this period.',
    );
  });
});
