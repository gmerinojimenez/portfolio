import { describe, expect, it } from 'vitest';
import type { SourceRef } from './context';
import {
  costMicroUsd,
  estimateTokens,
  maxCostMicroUsd,
  microUsdToUsd,
  usdToMicroUsd,
} from './pricing';
import { extractSources, systemInstructions } from './prompt';
import { validateRequest } from './validation';

describe('cost from usage (Haiku 5.5)', () => {
  it('prices each kind of token', () => {
    // 1M of each, in µUSD: 0.10 + 0.50 + 0.01 + 0.125 USD.
    expect(
      costMicroUsd({
        inputTokens: 1_000_000 / 10,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(10_000);
    expect(
      costMicroUsd({
        inputTokens: 2_600,
        outputTokens: 350,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(435); // 260 + 175
  });

  it('cache reads are 10x cheaper than input; writes 1.25x dearer', () => {
    const base = { inputTokens: 0, outputTokens: 0 };
    expect(
      costMicroUsd({
        ...base,
        cacheReadInputTokens: 10_000,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(100);
    expect(
      costMicroUsd({
        ...base,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 10_000,
      }),
    ).toBe(1_250);
  });

  it('rounds up to a whole micro-dollar and never returns float noise', () => {
    expect(
      costMicroUsd({
        inputTokens: 3,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(1);
    expect(
      Number.isInteger(
        costMicroUsd({
          inputTokens: 7,
          outputTokens: 13,
          cacheReadInputTokens: 17,
          cacheCreationInputTokens: 19,
        }),
      ),
    ).toBe(true);
  });

  it('applies the long-context price above 100K input tokens', () => {
    const usage = {
      inputTokens: 100_001,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    expect(costMicroUsd(usage)).toBe(Math.ceil(100_001 * 0.1 * 5));
  });

  it('the brake reservation is an upper bound of any real cost', () => {
    const inputTokens = 2_600;
    const max = maxCostMicroUsd(inputTokens, 1_024);
    for (const split of [0, 0.5, 1]) {
      const real = costMicroUsd({
        inputTokens: Math.round(inputTokens * split),
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: inputTokens - Math.round(inputTokens * split),
        outputTokens: 1_024,
      });
      expect(real).toBeLessThanOrEqual(max);
    }
  });

  it('converts between USD and µUSD', () => {
    expect(usdToMicroUsd(0.5)).toBe(500_000);
    expect(microUsdToUsd(435)).toBeCloseTo(0.000435);
    expect(estimateTokens('abcdef')).toBe(2);
  });
});

describe('validateRequest', () => {
  const body = (value: unknown) => JSON.stringify(value);
  const ok = {
    locale: 'en',
    turnstileToken: 't',
    messages: [{ role: 'user', content: '  Kotlin experience?  ' }],
  };

  it('accepts a valid single question and trims it', () => {
    const result = validateRequest(body(ok));
    expect(result).toEqual({
      ok: true,
      value: {
        locale: 'en',
        turnstileToken: 't',
        messages: [{ role: 'user', content: 'Kotlin experience?' }],
      },
    });
  });

  it('accepts alternating turns that end with a question', () => {
    const result = validateRequest(
      body({
        ...ok,
        messages: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
          { role: 'user', content: 'c' },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', '[]'],
    ['bad locale', body({ ...ok, locale: 'fr' })],
    ['no token', body({ ...ok, turnstileToken: undefined })],
    ['no messages', body({ ...ok, messages: [] })],
    [
      'ends with assistant',
      body({
        ...ok,
        messages: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
        ],
      }),
    ],
    [
      'wrong order',
      body({
        ...ok,
        messages: [
          { role: 'assistant', content: 'a' },
          { role: 'user', content: 'b' },
          { role: 'user', content: 'c' },
        ],
      }),
    ],
    [
      'system role',
      body({ ...ok, messages: [{ role: 'system', content: 'x' }] }),
    ],
    [
      'empty question',
      body({ ...ok, messages: [{ role: 'user', content: '   ' }] }),
    ],
    [
      'question too long',
      body({ ...ok, messages: [{ role: 'user', content: 'x'.repeat(501) }] }),
    ],
    [
      'non-string content',
      body({ ...ok, messages: [{ role: 'user', content: 1 }] }),
    ],
    ['body too large', body({ ...ok, padding: 'x'.repeat(40_000) })],
  ])('rejects %s', (_name, raw) => {
    expect(validateRequest(raw).ok).toBe(false);
  });

  it('caps the number of questions per conversation', () => {
    const turns = (questions: number) =>
      Array.from({ length: questions * 2 - 1 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'x',
      }));
    expect(validateRequest(body({ ...ok, messages: turns(6) })).ok).toBe(true);
    expect(validateRequest(body({ ...ok, messages: turns(7) })).ok).toBe(false);
  });

  it('keeps the locale on errors so the message can be localized', () => {
    const result = validateRequest(body({ ...ok, messages: [] }));
    expect(result).toMatchObject({ ok: false, locale: 'en' });
  });
});

describe('prompt', () => {
  const known: SourceRef[] = [
    { id: 'demo-a', kind: 'item', title: 'A' },
    { id: 'demo-b', kind: 'item', title: 'B' },
    { id: 'demo-note', kind: 'note', title: 'N' },
  ];

  it('extracts known cited ids in order, once each', () => {
    const text =
      'Did X [demo-b]. Also Y [demo-a, demo-note] and again [demo-b]. See [made-up] and [link](https://x).';
    expect(extractSources(text, known).map((s) => s.id)).toEqual([
      'demo-b',
      'demo-a',
      'demo-note',
    ]);
  });

  it('instructions are stable per locale and carry no variable data', () => {
    expect(systemInstructions('es')).toBe(systemInstructions('es'));
    expect(systemInstructions('es')).toContain('Answer in Spanish');
    expect(systemInstructions('en')).toContain('Answer in English');
    expect(systemInstructions('es')).toContain('"contacto"');
    expect(systemInstructions('en')).toContain('"contact"');
  });
});
