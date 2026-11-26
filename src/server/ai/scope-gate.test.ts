import { APITimeoutError } from '@typesafe-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  GATE_TIMEOUT_MS,
  JEV_MODEL,
  JevScopeGate,
  type SystemOneClient,
} from './jev-scope-gate';
import { jevCostMicroUsd } from './pricing';
import { GATE_ANSWER_CHARS, gateState, verdictFor } from './scope-gate';
import type { ChatTurn } from './validation';

describe('verdictFor', () => {
  it('rejects only a clear no', () => {
    expect(verdictFor(0.05)).toBe('reject');
    expect(verdictFor(0.299)).toBe('reject');
    expect(verdictFor(0.3)).toBe('pass');
    expect(verdictFor(0.5)).toBe('pass');
  });
});

describe('gateState', () => {
  it('keeps the last turns, with earlier answers cut', () => {
    const long = 'x'.repeat(GATE_ANSWER_CHARS + 50);
    const messages: ChatTurn[] = [
      { role: 'user', content: 'primera' },
      { role: 'assistant', content: 'respuesta uno' },
      { role: 'user', content: '¿Qué hizo en Tuenti?' },
      { role: 'assistant', content: long },
      { role: 'user', content: '¿y en Merlyn?' },
    ];
    const state = gateState(messages, ['Merlyn', 'Tuenti']);
    expect(state.portfolio_topics).toEqual(['Merlyn', 'Tuenti']);
    expect(state.latest_question).toBe('¿y en Merlyn?');
    expect(state.conversation).toEqual([
      { from: 'assistant', text: 'respuesta uno' },
      { from: 'visitor', text: '¿Qué hizo en Tuenti?' },
      { from: 'assistant', text: `${'x'.repeat(GATE_ANSWER_CHARS)}…` },
    ]);
  });

  it('has no conversation for a first question', () => {
    expect(gateState([{ role: 'user', content: 'hola' }])).toEqual({
      portfolio_topics: [],
      conversation: [],
      latest_question: 'hola',
    });
  });
});

describe('jevCostMicroUsd', () => {
  it('rounds up to whole micro-dollars', () => {
    expect(jevCostMicroUsd(0)).toBe(0);
    expect(jevCostMicroUsd(1_000)).toBe(42);
    expect(jevCostMicroUsd(10)).toBe(1);
  });
});

type Call = { request: Record<string, unknown>; options: unknown };

function fakeClient(reply: () => unknown): {
  client: SystemOneClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const client = {
    systemOne: (request: Record<string, unknown>, options: unknown) => {
      calls.push({ request, options });
      return Promise.resolve().then(reply);
    },
  } as unknown as SystemOneClient;
  return { client, calls };
}

const answer = (inScope: number, language = 'es', p = 0.95) => ({
  model: 'jev-1.14.0',
  answers: {
    inScope: { type: 'noul', noul: inScope },
    language: {
      type: 'choice',
      choice: language,
      confidence: p,
      probabilities: { [language]: p, other: 1 - p },
    },
  },
  usage: { input_tokens: 512, output_tokens: 3 },
});

const question: ChatTurn[] = [
  { role: 'user', content: '¿Cómo se hace un flan?' },
];

describe('JevScopeGate', () => {
  it('sends the pinned model, the state and both questions', async () => {
    const { client, calls } = fakeClient(() => answer(0.9));
    await new JevScopeGate(client).check({ locale: 'es', messages: question });

    const { request, options } = calls[0]!;
    expect(request['model']).toBe(JEV_MODEL);
    expect(request['state']).toEqual({
      portfolio_topics: [],
      conversation: [],
      latest_question: '¿Cómo se hace un flan?',
    });
    expect(Object.keys(request['questions'] as object)).toEqual([
      'inScope',
      'language',
    ]);
    expect((options as { signal: AbortSignal }).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('rejects a clear no and reports the detected language', async () => {
    const { client } = fakeClient(() => answer(0.04, 'en'));
    let t = 0;
    const gate = new JevScopeGate(client, GATE_TIMEOUT_MS, () => (t += 100));
    expect(await gate.check({ locale: 'es', messages: question })).toEqual({
      verdict: 'reject',
      inScope: 0.04,
      language: 'en',
      model: 'jev-1.14.0',
      inputTokens: 512,
      latencyMs: 100,
    });
  });

  it('passes doubtful questions and drops an unsure language', async () => {
    const { client } = fakeClient(() => answer(0.45, 'en', 0.55));
    const result = await new JevScopeGate(client).check({
      locale: 'es',
      messages: question,
    });
    expect(result).toMatchObject({ verdict: 'pass', inScope: 0.45 });
    expect(result).not.toHaveProperty('language');
  });

  it('fails open on timeouts and malformed answers', async () => {
    const timeout = fakeClient(() => {
      throw new APITimeoutError(1_500);
    });
    expect(
      await new JevScopeGate(timeout.client).check({
        locale: 'es',
        messages: question,
      }),
    ).toMatchObject({ verdict: 'error', reason: 'timeout', inputTokens: 0 });

    const malformed = fakeClient(() => ({ ...answer(0.5), answers: {} }));
    expect(
      await new JevScopeGate(malformed.client).check({
        locale: 'es',
        messages: question,
      }),
    ).toMatchObject({ verdict: 'error' });
  });
});
