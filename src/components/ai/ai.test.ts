import { describe, expect, it } from 'vitest';
import { STATUS, type WireEvent } from '../../server/ai/messages';
import { DEFAULT_INPUT_LIMITS } from '../../server/ai/validation';
import { ui } from '../../i18n/ui';
import { toCapture } from '../../lib/analytics/events';
import type { ConsoleEvent } from '../console/core/events';
import { streamAnswer, failureFromStatus, type StreamEvent } from './client';
import { renderAnswer, renderSources, type RenderOptions } from './citations';
import { resolveAiConfig } from './config';
import { Conversation } from './conversation';
import {
  degradedForMs,
  failureText,
  formatWait,
  suggestsCommands,
  type AiErrorCode,
  type AiFailure,
} from './errors';
import { formatCost, formatLatency, transparencyLine } from './format';
import { NdjsonParser } from './ndjson';
import { LIMITS, isErrorCode, toWireEvent } from './protocol';
import { AiSession, type AnswerResult, type AnswerView } from './session';
import { TurnstileTokens, type TurnstileApi } from './turnstile';

const lines = (...events: unknown[]) =>
  events.map((event) => `${JSON.stringify(event)}\n`).join('');

describe('protocol', () => {
  it('matches the server limits and error codes', () => {
    expect(LIMITS).toEqual({
      maxQuestions: DEFAULT_INPUT_LIMITS.maxQuestions,
      maxQuestionChars: DEFAULT_INPUT_LIMITS.maxQuestionChars,
      maxAnswerChars: DEFAULT_INPUT_LIMITS.maxAnswerChars,
    });
    for (const code of Object.keys(STATUS))
      expect(isErrorCode(code)).toBe(true);
    expect(isErrorCode('nope')).toBe(false);
  });

  it('reads events and ignores what is not one', () => {
    expect(toWireEvent({ type: 'delta', text: 'hi' })).toEqual({
      type: 'delta',
      text: 'hi',
    });
    expect(toWireEvent({ type: 'delta', text: 3 })).toBeUndefined();
    expect(toWireEvent({ type: 'other' })).toBeUndefined();
    expect(toWireEvent('x')).toBeUndefined();
    expect(toWireEvent(null)).toBeUndefined();
  });

  it('is lenient with a done event and strict about error codes', () => {
    const done = toWireEvent({
      type: 'done',
      sources: [{ id: 'a', title: 'A' }, { nope: 1 }],
      usage: { inputTokens: 5 },
    });
    expect(done).toMatchObject({
      type: 'done',
      sources: [{ id: 'a', kind: 'item', title: 'A' }],
      usage: { inputTokens: 5, outputTokens: 0 },
      costUsd: 0,
    });
    expect(
      toWireEvent({ type: 'error', code: 'weird', message: 'x' }),
    ).toMatchObject({ code: 'internal' });
    expect(
      toWireEvent({
        type: 'error',
        code: 'rate_limited',
        retryAfterSeconds: 4.2,
      }),
    ).toMatchObject({ retryAfterSeconds: 5 });
  });
});

describe('NdjsonParser', () => {
  it('parses several lines in one chunk', () => {
    const parser = new NdjsonParser();
    const events = parser.push(
      lines(
        { type: 'meta', requestId: 'r', model: 'm' },
        { type: 'delta', text: 'a' },
      ),
    );
    expect(events.map((e) => e.type)).toEqual(['meta', 'delta']);
  });

  it('keeps a partial line until the rest arrives', () => {
    const parser = new NdjsonParser();
    const whole = lines({ type: 'delta', text: 'hello' });
    expect(parser.push(whole.slice(0, 10))).toEqual([]);
    expect(parser.push(whole.slice(10, -1))).toEqual([]);
    expect(parser.push('\n')).toEqual([{ type: 'delta', text: 'hello' }]);
  });

  it('handles lines split across many tiny chunks', () => {
    const parser = new NdjsonParser();
    const text = lines(
      { type: 'delta', text: 'a' },
      { type: 'delta', text: 'b' },
    );
    const events = [...text].flatMap((char) => parser.push(char));
    expect(events).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'delta', text: 'b' },
    ]);
  });

  it('flushes a last line without a newline on end()', () => {
    const parser = new NdjsonParser();
    expect(parser.push('{"type":"delta","text":"x"}')).toEqual([]);
    expect(parser.end()).toEqual([{ type: 'delta', text: 'x' }]);
  });

  it('skips blank, invalid and unknown lines and counts them', () => {
    const parser = new NdjsonParser();
    const events = parser.push(
      '\n{not json}\n{"type":"mystery"}\n{"type":"delta","text":"ok"}\r\n',
    );
    expect(events).toEqual([{ type: 'delta', text: 'ok' }]);
    expect(parser.skippedLines).toBe(2);
  });
});

describe('citations', () => {
  const cards = new Map([
    ['demo-app', { title: 'Demo app', path: '/es/proyectos/demo-app/' }],
    ['other', { title: 'Other <b>', path: '/es/proyectos/other/' }],
  ]);
  const sources = [
    { id: 'demo-app', kind: 'item' as const, title: 'Demo app' },
    { id: 'a-note', kind: 'note' as const, title: 'A note' },
  ];
  const options = (over: Partial<RenderOptions> = {}): RenderOptions => ({
    sources,
    cards,
    ...over,
  });

  it('links only ids listed in sources', () => {
    const html = renderAnswer(
      'Built it [demo-app]. Not cited [other] nor [made-up].',
      options(),
    ).value;
    expect(html).toContain(
      '<a class="c-link c-cite" href="/es/proyectos/demo-app/" data-card-open="demo-app">Demo app</a>',
    );
    expect(html).not.toContain('data-card-open="other"');
    expect(html).toContain('[other]');
    expect(html).toContain('[made-up]');
  });

  it('shows a source without a card as plain text', () => {
    const html = renderAnswer('See [a-note].', options()).value;
    expect(html).toContain('<span class="c-cite c-dim">A note</span>');
    expect(html).not.toContain('<a ');
  });

  it('handles several ids in one bracket', () => {
    const html = renderAnswer(
      'Both [demo-app, a-note, nope].',
      options(),
    ).value;
    expect(html).toContain('data-card-open="demo-app"');
    expect(html).toContain('A note');
    expect(html).toContain('nope]');
  });

  it('never links while streaming and hides a half-received bracket', () => {
    const html = renderAnswer(
      'Done [demo-app] and then [demo-',
      options({ sources: [], streaming: true }),
    ).value;
    expect(html).toContain('[demo-app]');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('[demo-<');
    expect(html.endsWith('and then</p>')).toBe(true);
  });

  it('escapes everything the model writes', () => {
    const html = renderAnswer(
      '<img src=x onerror=1> & "q" [x]',
      options(),
    ).value;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders paragraphs, lists, bold and code, and command buttons', () => {
    const html = renderAnswer(
      'First **bold** line\nsecond line\n\n- one\n- two with `code`\n\nWrite `contacto`.',
      options({ isCommand: (name) => name === 'contacto' }),
    ).value;
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<br>');
    expect(html).toContain('<ul class="c-ai-list"><li>one</li>');
    expect(html).toContain('<code class="c-code">code</code>');
    expect(html).toContain('data-cmd="contacto"');
  });

  it('builds the sources line from the listed sources', () => {
    const html = renderSources(sources, options(), 'Sources:').value;
    expect(html).toContain('Sources:');
    expect(html).toContain('data-card-open="demo-app"');
    expect(html).toContain('A note');
    expect(renderSources([], options(), 'Sources:').value).toBe('');
  });
});

describe('errors', () => {
  const t = ui.en.ai;
  const server: AiErrorCode[] = Object.keys(STATUS) as AiErrorCode[];
  const local: AiErrorCode[] = [
    'network',
    'timeout',
    'interrupted',
    'bad_response',
    'turnstile_unavailable',
    'too_long',
    'turn_limit',
  ];

  it('has a message in both languages for every code', () => {
    for (const code of [...server, ...local]) {
      expect(failureText({ code }, ui.es.ai).text, code).not.toMatch(/[{}]/);
      expect(failureText({ code }, t).text, code).toBeTruthy();
    }
  });

  it('prefers the server message and fills the limits in our own', () => {
    expect(
      failureText({ code: 'internal', message: 'Server says no.' }, t).text,
    ).toBe('Server says no.');
    expect(failureText({ code: 'too_long' }, t).text).toContain('500');
    expect(failureText({ code: 'turn_limit' }, t).text).toContain(
      '6 questions',
    );
  });

  it('adds the wait for rate limits', () => {
    const failure: AiFailure = { code: 'rate_limited', retryAfterSeconds: 45 };
    expect(failureText(failure, t).text).toContain('45 s');
    expect(formatWait(59)).toBe('59 s');
    expect(formatWait(61)).toBe('2 min');
  });

  it('decides which failures pause the AI and which suggest commands', () => {
    expect(degradedForMs('budget_exhausted')).toBe(Infinity);
    expect(degradedForMs('unavailable')).toBeGreaterThan(0);
    expect(degradedForMs('internal')).toBeGreaterThan(0);
    expect(degradedForMs('network')).toBe(0);
    expect(degradedForMs('rate_limited')).toBe(0);
    expect(suggestsCommands('unavailable')).toBe(true);
    expect(suggestsCommands('rate_limited')).toBe(false);
    expect(suggestsCommands('turn_limit')).toBe(false);
  });

  it('maps an unreadable HTTP error to a code', () => {
    expect(failureFromStatus(429).code).toBe('rate_limited');
    expect(failureFromStatus(403).code).toBe('forbidden_origin');
    expect(failureFromStatus(500).code).toBe('internal');
    expect(failureFromStatus(502).code).toBe('unavailable');
    expect(failureFromStatus(418).code).toBe('bad_response');
  });
});

describe('format', () => {
  it('formats cost and latency', () => {
    expect(formatCost(0.0004)).toBe('$0.0004');
    expect(formatCost(0.0213)).toBe('$0.021');
    expect(formatLatency(850)).toBe('850 ms');
    expect(formatLatency(2140)).toBe('2.1 s');
  });

  it('builds the transparency line with and without cache', () => {
    const base = {
      model: 'claude-haiku-5-5',
      costUsd: 0.0004,
      latencyMs: 2100,
    };
    const cold = transparencyLine(
      {
        ...base,
        usage: {
          inputTokens: 10,
          outputTokens: 340,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 1590,
        },
      },
      'en',
      ui.en.ai,
    );
    expect(cold).toBe(
      'claude-haiku-5-5 · 1,600 tokens in · 340 out · $0.0004 · 2.1 s',
    );
    const warm = transparencyLine(
      {
        ...base,
        usage: {
          inputTokens: 100,
          outputTokens: 300,
          cacheReadInputTokens: 1500,
          cacheCreationInputTokens: 0,
        },
      },
      'es',
      ui.es.ai,
    );
    expect(warm).toContain('1600 tokens de entrada');
    expect(warm).toContain('1500 en caché');
  });
});

describe('config', () => {
  it('needs both values', () => {
    expect(resolveAiConfig({})).toBeUndefined();
    expect(
      resolveAiConfig({ PUBLIC_AI_URL: 'https://x.test/' }),
    ).toBeUndefined();
    expect(resolveAiConfig({ PUBLIC_TURNSTILE_SITE_KEY: 'k' })).toBeUndefined();
    expect(
      resolveAiConfig({ PUBLIC_AI_URL: ' ', PUBLIC_TURNSTILE_SITE_KEY: 'k' }),
    ).toBeUndefined();
  });

  it('accepts https and localhost http only', () => {
    const key = { PUBLIC_TURNSTILE_SITE_KEY: ' k ' };
    expect(
      resolveAiConfig({
        PUBLIC_AI_URL: 'https://abc.lambda-url.eu-north-1.on.aws/',
        ...key,
      }),
    ).toEqual({
      url: 'https://abc.lambda-url.eu-north-1.on.aws/',
      siteKey: 'k',
    });
    expect(
      resolveAiConfig({ PUBLIC_AI_URL: 'http://localhost:9999', ...key })?.url,
    ).toBe('http://localhost:9999/');
    expect(
      resolveAiConfig({ PUBLIC_AI_URL: 'http://evil.test', ...key }),
    ).toBeUndefined();
    expect(
      resolveAiConfig({ PUBLIC_AI_URL: 'javascript:alert(1)', ...key }),
    ).toBeUndefined();
    expect(
      resolveAiConfig({ PUBLIC_AI_URL: 'nonsense', ...key }),
    ).toBeUndefined();
  });
});

describe('Conversation', () => {
  it('sends the history plus the new question, alternating roles', () => {
    const conversation = new Conversation();
    expect(conversation.messagesFor(' first ')).toEqual([
      { role: 'user', content: 'first' },
    ]);
    conversation.commit('first', 'answer one');
    expect(conversation.messagesFor('second')).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer one' },
      { role: 'user', content: 'second' },
    ]);
  });

  it('stops at the backend limit and resets', () => {
    const conversation = new Conversation();
    for (let i = 0; i < LIMITS.maxQuestions; i += 1) {
      expect(conversation.isFull).toBe(false);
      conversation.commit(`q${i}`, `a${i}`);
    }
    expect(conversation.isFull).toBe(true);
    conversation.commit('extra', 'extra');
    expect(conversation.questionsAsked).toBe(LIMITS.maxQuestions);
    // The history of a full conversation is what the backend accepts.
    expect(conversation.messagesFor('x').length).toBe(
      LIMITS.maxQuestions * 2 + 1,
    );
    conversation.reset();
    expect(conversation.questionsAsked).toBe(0);
    expect(conversation.isFull).toBe(false);
  });

  it('ignores empty answers and truncates long ones when sending', () => {
    const conversation = new Conversation();
    conversation.commit('q', '   ');
    expect(conversation.questionsAsked).toBe(0);
    conversation.commit('q', 'x'.repeat(LIMITS.maxAnswerChars + 50));
    const [, assistant] = conversation.messagesFor('next');
    expect(assistant?.content.length).toBe(LIMITS.maxAnswerChars);
  });
});

// ---------- Client with a fake fetch ----------

const encoder = new TextEncoder();

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });
}

function fakeFetch(
  chunks: (string | Uint8Array)[],
  init: ResponseInit = { status: 200 },
): typeof fetch {
  return () => Promise.resolve(new Response(streamOf(chunks), init));
}

async function collect(
  fetchFn: typeof fetch,
  timeoutMs?: number,
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of streamAnswer({
    url: 'http://localhost:9/',
    request: { locale: 'es', messages: [], turnstileToken: 't' },
    fetchFn,
    ...(timeoutMs ? { timeoutMs } : {}),
  })) {
    events.push(event);
  }
  return events;
}

const doneLine = {
  type: 'done',
  sources: [],
  stopReason: 'end_turn',
  usage: {},
  costUsd: 0.0002,
  latencyMs: 900,
  model: 'm',
};

describe('streamAnswer', () => {
  it('yields events across arbitrary chunk boundaries, UTF-8 included', async () => {
    const bytes = encoder.encode(
      lines(
        { type: 'meta', requestId: 'r', model: 'm' },
        { type: 'delta', text: 'añ€' },
        doneLine,
      ),
    );
    // Cut in the middle of the multi-byte characters.
    const chunks = [bytes.slice(0, 55), bytes.slice(55, 80), bytes.slice(80)];
    const events = await collect(fakeFetch(chunks));
    expect(events.map((e) => e.type)).toEqual(['meta', 'delta', 'done']);
    expect(events[1]).toEqual({ type: 'delta', text: 'añ€' });
  });

  it('reports an error that arrives after some text with HTTP 200', async () => {
    const events = await collect(
      fakeFetch([
        lines({ type: 'delta', text: 'part' }),
        lines({
          type: 'error',
          code: 'unavailable',
          message: 'Down',
        }),
      ]),
    );
    expect(events.at(-1)).toEqual({
      type: 'error',
      failure: {
        code: 'unavailable',
        message: 'Down',
        retryAfterSeconds: undefined,
      },
    });
  });

  it('reads the NDJSON error body of an HTTP 429', async () => {
    const events = await collect(
      fakeFetch(
        [
          lines({
            type: 'error',
            code: 'rate_limited',
            message: 'Slow',
            retryAfterSeconds: 30,
          }),
        ],
        { status: 429 },
      ),
    );
    expect(events).toEqual([
      {
        type: 'error',
        failure: {
          code: 'rate_limited',
          message: 'Slow',
          retryAfterSeconds: 30,
        },
      },
    ]);
  });

  it('falls back to the status when the body is not NDJSON', async () => {
    const events = await collect(
      fakeFetch(['<html>Bad gateway</html>'], { status: 502 }),
    );
    expect(events).toEqual([
      { type: 'error', failure: { code: 'unavailable' } },
    ]);
  });

  it('flags a stream cut before done', async () => {
    const afterText = await collect(
      fakeFetch([lines({ type: 'delta', text: 'half' })]),
    );
    expect(afterText.at(-1)).toEqual({
      type: 'error',
      failure: { code: 'interrupted' },
    });
    const empty = await collect(fakeFetch(['']));
    expect(empty).toEqual([
      { type: 'error', failure: { code: 'bad_response' } },
    ]);
  });

  it('reports a network failure and a timeout', async () => {
    const down = await collect(() => Promise.reject(new TypeError('offline')));
    expect(down).toEqual([{ type: 'error', failure: { code: 'network' } }]);

    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const slow = await collect(hang, 20);
    expect(slow).toEqual([{ type: 'error', failure: { code: 'timeout' } }]);
  });

  it('sends the contract body', async () => {
    let sent: { url: string; body: unknown; method?: string } | undefined;
    const spy: typeof fetch = (url, init) => {
      sent = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
        ...(init?.method ? { method: init.method } : {}),
      };
      return Promise.resolve(new Response(streamOf([lines(doneLine)])));
    };
    await collect(spy);
    expect(sent).toEqual({
      url: 'http://localhost:9/',
      method: 'POST',
      body: { locale: 'es', messages: [], turnstileToken: 't' },
    });
  });
});

// ---------- Session with a fake stream and view ----------

function fakeView() {
  const calls: string[] = [];
  let appended = '';
  let result: AnswerResult | undefined;
  let failure: { failure: AiFailure; partial: string } | undefined;
  const view: AnswerView = {
    append: (delta) => {
      appended += delta;
      calls.push('append');
      return Promise.resolve();
    },
    finish: (r) => {
      result = r;
      calls.push('finish');
    },
    fail: (f, partial) => {
      failure = { failure: f, partial };
      calls.push('fail');
    },
  };
  return {
    view,
    calls,
    get appended() {
      return appended;
    },
    get result() {
      return result;
    },
    get failure() {
      return failure;
    },
  };
}

type Script = StreamEvent[];

function session(scripts: Script[], options: { now?: () => number } = {}) {
  const requests: { messages: unknown; turnstileToken: string }[] = [];
  const events: ConsoleEvent[] = [];
  let tokens = 0;
  const instance = new AiSession({
    url: 'http://localhost:9/',
    tokens: { token: () => Promise.resolve(`token-${(tokens += 1)}`) },
    emit: (event) => events.push(event),
    ...(options.now ? { now: options.now } : {}),
    stream: async function* (request) {
      requests.push(request.request);
      const script = scripts.shift() ?? [];
      for (const event of script) yield event;
    },
  });
  return {
    instance,
    requests,
    events,
    get tokens() {
      return tokens;
    },
  };
}

const delta = (text: string): StreamEvent => ({ type: 'delta', text });
const done = (
  sources: { id: string; kind: 'item'; title: string }[] = [],
): StreamEvent => ({
  type: 'done',
  sources,
  stopReason: 'end_turn',
  usage: {
    inputTokens: 1,
    outputTokens: 2,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  },
  costUsd: 0.0001,
  latencyMs: 10,
  model: 'm',
});
const failed = (failure: AiFailure): StreamEvent => ({
  type: 'error',
  failure,
});

describe('AiSession', () => {
  it('streams an answer, keeps the turn and tracks it by stop reason only', async () => {
    const s = session([
      [
        delta('Hello '),
        delta('[a]'),
        done([{ id: 'a', kind: 'item', title: 'A' }]),
      ],
    ]);
    const v = fakeView();
    await s.instance.ask('Question?', 'en', v.view);
    expect(v.appended).toBe('Hello [a]');
    expect(v.result?.text).toBe('Hello [a]');
    expect(v.result?.sources).toEqual([{ id: 'a', kind: 'item', title: 'A' }]);
    expect(s.instance.conversation.questionsAsked).toBe(1);
    expect(s.events).toEqual([{ type: 'ai-answered', stopReason: 'end_turn' }]);
    expect(JSON.stringify(s.events)).not.toContain('Question');
    expect(s.requests[0]).toMatchObject({
      locale: 'en',
      messages: [{ role: 'user', content: 'Question?' }],
      turnstileToken: 'token-1',
    });
  });

  it('sends the history and a new token with every question', async () => {
    const s = session([
      [delta('one'), done()],
      [delta('two'), done()],
    ]);
    await s.instance.ask('q1', 'es', fakeView().view);
    await s.instance.ask('q2', 'es', fakeView().view);
    expect(s.requests.map((r) => r.turnstileToken)).toEqual([
      'token-1',
      'token-2',
    ]);
    expect(s.requests[1]?.messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'one' },
      { role: 'user', content: 'q2' },
    ]);
  });

  it('does not keep a failed question and shows the partial text', async () => {
    const s = session([
      [delta('partial'), failed({ code: 'unavailable', message: 'Down' })],
    ]);
    const v = fakeView();
    await s.instance.ask('q', 'es', v.view);
    expect(v.failure).toEqual({
      failure: { code: 'unavailable', message: 'Down' },
      partial: 'partial',
    });
    expect(s.instance.conversation.questionsAsked).toBe(0);
    expect(s.events).toEqual([{ type: 'ai-error', code: 'unavailable' }]);
  });

  it('retries once with a fresh token when Turnstile is rejected', async () => {
    const s = session([
      [failed({ code: 'turnstile_failed' })],
      [delta('ok'), done()],
    ]);
    const v = fakeView();
    await s.instance.ask('q', 'es', v.view);
    expect(s.requests.map((r) => r.turnstileToken)).toEqual([
      'token-1',
      'token-2',
    ]);
    expect(v.result?.text).toBe('ok');
    expect(s.events).toEqual([{ type: 'ai-answered', stopReason: 'end_turn' }]);
  });

  it('gives up after a second Turnstile rejection', async () => {
    const s = session([
      [failed({ code: 'turnstile_failed' })],
      [failed({ code: 'turnstile_failed' })],
    ]);
    const v = fakeView();
    await s.instance.ask('q', 'es', v.view);
    expect(s.requests).toHaveLength(2);
    expect(v.failure?.failure.code).toBe('turnstile_failed');
  });

  it('reports Turnstile being unavailable without calling the backend', async () => {
    const events: ConsoleEvent[] = [];
    const instance = new AiSession({
      url: 'http://localhost:9/',
      tokens: { token: () => Promise.reject(new Error('blocked')) },
      emit: (e) => events.push(e),
      stream: () => {
        throw new Error('must not be called');
      },
    });
    const v = fakeView();
    await instance.ask('q', 'es', v.view);
    expect(v.failure?.failure.code).toBe('turnstile_unavailable');
    expect(events).toEqual([
      { type: 'ai-error', code: 'turnstile_unavailable' },
    ]);
  });

  it('refuses long questions locally and at the conversation limit', async () => {
    const s = session([]);
    const v = fakeView();
    await s.instance.ask('x'.repeat(LIMITS.maxQuestionChars + 1), 'es', v.view);
    expect(v.failure?.failure.code).toBe('too_long');
    expect(s.requests).toHaveLength(0);
    expect(s.tokens).toBe(0);

    const scripts: Script[] = Array.from(
      { length: LIMITS.maxQuestions },
      () => [delta('a'), done()],
    );
    const full = session(scripts);
    for (let i = 0; i < LIMITS.maxQuestions; i += 1) {
      await full.instance.ask(`q${i}`, 'es', fakeView().view);
    }
    const last = fakeView();
    await full.instance.ask('one more', 'es', last.view);
    expect(last.failure?.failure.code).toBe('turn_limit');
    expect(full.requests).toHaveLength(LIMITS.maxQuestions);
    full.instance.reset();
    expect(full.instance.conversation.isFull).toBe(false);
  });

  it('stays degraded after budget_exhausted and recovers from a short outage', async () => {
    let clock = 0;
    const budget = session([[failed({ code: 'budget_exhausted' })]], {
      now: () => clock,
    });
    await budget.instance.ask('q1', 'es', fakeView().view);
    clock += 24 * 3600_000;
    const again = fakeView();
    await budget.instance.ask('q2', 'es', again.view);
    expect(again.failure?.failure.code).toBe('budget_exhausted');
    expect(budget.requests).toHaveLength(1);

    clock = 0;
    const outage = session(
      [[failed({ code: 'unavailable' })], [delta('back'), done()]],
      { now: () => clock },
    );
    await outage.instance.ask('q1', 'es', fakeView().view);
    clock += 60_000;
    const during = fakeView();
    await outage.instance.ask('q2', 'es', during.view);
    expect(during.failure?.failure.code).toBe('unavailable');
    expect(outage.requests).toHaveLength(1);
    clock += 5 * 60_000;
    const after = fakeView();
    await outage.instance.ask('q3', 'es', after.view);
    expect(after.result?.text).toBe('back');
  });

  it('treats a stream that ends without a final event as interrupted', async () => {
    const s = session([[delta('x')]]);
    const v = fakeView();
    await s.instance.ask('q', 'es', v.view);
    expect(v.failure).toMatchObject({
      failure: { code: 'interrupted' },
      partial: 'x',
    });
  });
});

// ---------- Turnstile with a fake API ----------

describe('TurnstileTokens', () => {
  function fakeApi() {
    const log: string[] = [];
    let onToken: ((token: string) => void) | undefined;
    let onError: ((code: unknown) => void) | undefined;
    let issued = 0;
    const api: TurnstileApi = {
      render(_container, options) {
        log.push(
          `render:${String(options['execution'])}:${String(options['appearance'])}`,
        );
        onToken = options['callback'] as (token: string) => void;
        onError = options['error-callback'] as (code: unknown) => void;
        return 'w1';
      },
      reset: (id) => log.push(`reset:${id}`),
      execute(id) {
        log.push(`execute:${id}`);
        queueMicrotask(() => onToken?.(`tok-${(issued += 1)}`));
      },
    };
    return { api, log, fail: (code: unknown) => onError?.(code) };
  }

  it('loads once, renders once and gives a fresh token each time', async () => {
    const fake = fakeApi();
    let loads = 0;
    const tokens = new TurnstileTokens(
      'key',
      () => ({}) as HTMLElement,
      () => {
        loads += 1;
        return Promise.resolve(fake.api);
      },
    );
    expect(loads).toBe(0); // nothing is loaded until the first question
    expect(await tokens.token()).toBe('tok-1');
    expect(await tokens.token()).toBe('tok-2');
    expect(loads).toBe(1);
    expect(fake.log).toEqual([
      'render:execute:interaction-only',
      'execute:w1',
      'reset:w1',
      'execute:w1',
    ]);
  });

  it('rejects when the script cannot load, and can retry later', async () => {
    const fake = fakeApi();
    let attempt = 0;
    const tokens = new TurnstileTokens(
      'key',
      () => ({}) as HTMLElement,
      () =>
        ++attempt === 1
          ? Promise.reject(new Error('blocked'))
          : Promise.resolve(fake.api),
    );
    await expect(tokens.token()).rejects.toThrow('blocked');
    expect(await tokens.token()).toBe('tok-1');
  });

  it('rejects on a widget error', async () => {
    const fake = fakeApi();
    const api: TurnstileApi = {
      ...fake.api,
      execute: () => queueMicrotask(() => fake.fail('300030')),
    };
    const tokens = new TurnstileTokens(
      'key',
      () => ({}) as HTMLElement,
      () => Promise.resolve(api),
    );
    await expect(tokens.token()).rejects.toThrow('300030');
  });
});

describe('analytics mapping', () => {
  it('records only codes for AI events', () => {
    const session = { locale: 'es' };
    expect(
      toCapture({ type: 'ai-answered', stopReason: 'end_turn' }, session),
    ).toEqual({
      name: 'ai_answered',
      properties: { locale: 'es', stop_reason: 'end_turn' },
    });
    expect(
      toCapture({ type: 'ai-error', code: 'rate_limited' }, session),
    ).toEqual({
      name: 'ai_error',
      properties: { locale: 'es', code: 'rate_limited' },
    });
    expect(
      toCapture({ type: 'ai-error', code: 'free text with spaces' }, session)
        .properties,
    ).toMatchObject({ code: 'invalid' });
  });
});

// Guard: the wire types stay in sync with what these tests build.
const _wire: WireEvent = { type: 'delta', text: '' };
void _wire;
