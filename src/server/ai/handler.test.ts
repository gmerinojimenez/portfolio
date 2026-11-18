import { describe, expect, it } from 'vitest';
import type { AiContextFile } from './context';
import {
  createAiHandler,
  type HttpRequest,
  type ResponseSink,
} from './handler';
import type { WireEvent } from './messages';
import type { TokenUsage } from './pricing';
import {
  ProviderError,
  type AiProvider,
  type ProviderEvent,
  type ProviderRequest,
} from './provider';
import { RateLimiter } from './rate-limit';
import { SpendBrake, dayKey } from './spend-brake';
import { MemoryStore } from './store';

const ORIGIN = 'https://example.com';
const NOW = new Date('2026-11-18T10:00:00Z');

const context: AiContextFile = {
  version: 1,
  locales: {
    es: {
      document: '<portfolio_content locale="es">…</portfolio_content>',
      sources: [
        { id: 'demo-app', kind: 'item', title: 'App' },
        { id: 'demo-note', kind: 'note', title: 'Nota' },
      ],
      estimatedTokens: 10,
    },
    en: {
      document: '<portfolio_content locale="en">…</portfolio_content>',
      sources: [{ id: 'demo-app', kind: 'item', title: 'App' }],
      estimatedTokens: 10,
    },
  },
};

const usage: TokenUsage = {
  inputTokens: 100,
  outputTokens: 50,
  cacheReadInputTokens: 2_000,
  cacheCreationInputTokens: 0,
};

class FakeProvider implements AiProvider {
  readonly model = 'fake-model';
  requests: ProviderRequest[] = [];
  constructor(
    private readonly script: (ProviderEvent | Error)[] = [
      { type: 'text', text: 'Trabajó en una app ' },
      { type: 'text', text: 'de banca [demo-app] [made-up].' },
      { type: 'end', usage, stopReason: 'end_turn', model: 'fake-model' },
    ],
  ) {}
  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    this.requests.push(request);
    for (const step of this.script) {
      if (step instanceof Error) throw step;
      yield step;
    }
  }
}

class MemorySink implements ResponseSink {
  status?: number;
  headers?: Record<string, string>;
  chunks: string[] = [];
  ended = 0;
  start(status: number, headers: Record<string, string>) {
    if (this.status !== undefined) throw new Error('started twice');
    this.status = status;
    this.headers = headers;
  }
  write(chunk: string) {
    if (this.status === undefined) throw new Error('write before start');
    this.chunks.push(chunk);
  }
  end() {
    this.ended += 1;
  }
  get events(): WireEvent[] {
    return this.chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as WireEvent);
  }
}

function setup(
  options: {
    provider?: FakeProvider;
    dailyLimitMicroUsd?: number;
    turnstile?: boolean;
    perMinute?: number;
  } = {},
) {
  const store = new MemoryStore();
  const provider = options.provider ?? new FakeProvider();
  const operational: Record<string, unknown>[] = [];
  const handle = createAiHandler({
    provider,
    brake: new SpendBrake(store, options.dailyLimitMicroUsd ?? 100_000),
    rateLimiter: new RateLimiter(store, {
      perMinute: options.perMinute ?? 5,
      perDay: 100,
    }),
    log: store,
    verifyTurnstile: async () => options.turnstile ?? true,
    hashIp: (ip) => `hash-${ip}`,
    context,
    allowedOrigins: [ORIGIN],
    now: () => NOW,
    newRequestId: () => 'req-1',
    logger: (record) => operational.push(record),
  });
  const run = async (overrides: Partial<HttpRequest> = {}, body?: unknown) => {
    const sink = new MemorySink();
    await handle(
      {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        sourceIp: '203.0.113.7',
        body: JSON.stringify(
          body ?? {
            locale: 'es',
            turnstileToken: 'token',
            messages: [{ role: 'user', content: '¿Ha hecho apps de banca?' }],
          },
        ),
        ...overrides,
      },
      sink,
    );
    return sink;
  };
  return { store, provider, run, operational };
}

describe('AI handler', () => {
  it('streams meta, deltas and done with cited sources, cost and usage', async () => {
    const { run, store, provider } = setup();
    const sink = await run();

    expect(sink.status).toBe(200);
    expect(sink.headers?.['content-type']).toContain('application/x-ndjson');
    expect(sink.ended).toBe(1);
    const events = sink.events;
    expect(events[0]).toEqual({
      type: 'meta',
      requestId: 'req-1',
      model: 'fake-model',
    });
    expect(events.filter((e) => e.type === 'delta').map((e) => e.text)).toEqual(
      ['Trabajó en una app ', 'de banca [demo-app] [made-up].'],
    );
    const done = events.at(-1);
    expect(done).toMatchObject({
      type: 'done',
      sources: [{ id: 'demo-app', kind: 'item', title: 'App' }],
      stopReason: 'end_turn',
      usage,
      // 100*0.1 + 50*0.5 + 2000*0.01 = 55 µUSD
      costUsd: 0.000055,
      model: 'fake-model',
    });

    // Prompt: fixed instructions + the locale's document; server-side max_tokens.
    const request = provider.requests[0]!;
    expect(request.instructions).toContain('reply in Spanish');
    expect(request.context).toBe(context.locales.es.document);
    expect(request.maxTokens).toBe(1024);

    // Brake settled with the real cost.
    expect(store.items.get(dayKey(NOW))).toEqual({
      committed: 55,
      spent: 55,
      requests: 1,
    });

    // Question logged without any IP data.
    expect(store.logs).toHaveLength(1);
    const log = store.logs[0]!;
    expect(log).toMatchObject({
      requestId: 'req-1',
      locale: 'es',
      question: '¿Ha hecho apps de banca?',
      turn: 1,
      sources: ['demo-app'],
      outcome: 'answered',
      costMicroUsd: 55,
    });
    expect(JSON.stringify(log)).not.toContain('203.0.113.7');
    expect(JSON.stringify(log)).not.toContain('hash-');
  });

  it('never puts the question text in the operational log', async () => {
    const { run, operational } = setup();
    await run();
    expect(JSON.stringify(operational)).not.toContain('banca');
  });

  it('rejects other origins and methods before doing anything', async () => {
    const { run, provider, store } = setup();
    const foreign = await run({ headers: { origin: 'https://evil.example' } });
    expect(foreign.status).toBe(403);
    expect(foreign.events).toEqual([
      expect.objectContaining({ type: 'error', code: 'forbidden_origin' }),
    ]);
    expect((await run({ headers: {} })).status).toBe(403);
    expect((await run({ method: 'GET' })).status).toBe(405);
    expect(provider.requests).toHaveLength(0);
    expect(store.items.size).toBe(0);
  });

  it('rejects invalid input with a localized message', async () => {
    const { run, provider } = setup();
    const sink = await run(
      {},
      { locale: 'en', turnstileToken: 't', messages: [] },
    );
    expect(sink.status).toBe(400);
    expect(sink.events[0]).toMatchObject({
      code: 'invalid_request',
      message: expect.stringContaining('could not read'),
    });
    expect(provider.requests).toHaveLength(0);
  });

  it('rate limits per IP with retryAfterSeconds', async () => {
    const { run, provider } = setup({ perMinute: 1 });
    expect((await run()).status).toBe(200);
    const limited = await run();
    expect(limited.status).toBe(429);
    expect(limited.events[0]).toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 60,
    });
    // A different IP is not affected.
    expect((await run({ sourceIp: '198.51.100.1' })).status).toBe(200);
    expect(provider.requests).toHaveLength(2);
  });

  it('rejects a failed Turnstile check', async () => {
    const { run, provider } = setup({ turnstile: false });
    const sink = await run();
    expect(sink.status).toBe(403);
    expect(sink.events[0]).toMatchObject({ code: 'turnstile_failed' });
    expect(provider.requests).toHaveLength(0);
  });

  it('degrades when the daily brake is reached, and logs it', async () => {
    const { run, provider, store } = setup({ dailyLimitMicroUsd: 10 });
    const sink = await run();
    expect(sink.status).toBe(503);
    expect(sink.events[0]).toMatchObject({
      code: 'budget_exhausted',
      message: expect.stringContaining('límite de hoy'),
    });
    expect(provider.requests).toHaveLength(0);
    expect(store.logs[0]).toMatchObject({
      outcome: 'budget_exhausted',
      costMicroUsd: 0,
    });
  });

  it('releases the reservation when the provider fails before answering', async () => {
    const provider = new FakeProvider([
      new ProviderError('unavailable', 'credit balance too low', 400),
    ]);
    const { run, store } = setup({ provider });
    const sink = await run();
    expect(sink.status).toBe(503);
    expect(sink.events).toEqual([
      expect.objectContaining({ type: 'error', code: 'unavailable' }),
    ]);
    expect(store.items.get(dayKey(NOW))?.committed).toBe(0);
    expect(store.logs[0]).toMatchObject({ outcome: 'provider_error' });
  });

  it('keeps the whole reservation when the provider fails mid-stream', async () => {
    const provider = new FakeProvider([
      { type: 'text', text: 'Empieza…' },
      new ProviderError('busy', 'connection reset'),
    ]);
    const { run, store } = setup({ provider });
    const sink = await run();
    expect(sink.status).toBe(200);
    const events = sink.events;
    expect(events.map((e) => e.type)).toEqual(['meta', 'delta', 'error']);
    expect(events.at(-1)).toMatchObject({ code: 'unavailable' });
    expect(sink.ended).toBe(1);
    const item = store.items.get(dayKey(NOW))!;
    expect(item.committed).toBeGreaterThan(0);
    expect(item.spent).toBe(item.committed);
  });

  it('reports truncated answers and refusals', async () => {
    const provider = new FakeProvider([
      { type: 'text', text: 'Respuesta larga' },
      { type: 'end', usage, stopReason: 'max_tokens', model: 'fake-model' },
    ]);
    const { run, store } = setup({ provider });
    const sink = await run();
    expect(sink.events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'max_tokens',
    });
    expect(store.logs[0]?.outcome).toBe('max_tokens');
  });

  it('passes the whole conversation and logs the turn number', async () => {
    const { run, provider, store } = setup();
    await run(
      {},
      {
        locale: 'en',
        turnstileToken: 't',
        messages: [
          { role: 'user', content: 'First?' },
          { role: 'assistant', content: 'Answer [demo-app].' },
          { role: 'user', content: 'And then?' },
        ],
      },
    );
    expect(provider.requests[0]?.messages).toHaveLength(3);
    expect(provider.requests[0]?.instructions).toContain('reply in English');
    expect(store.logs[0]).toMatchObject({
      turn: 2,
      question: 'And then?',
      locale: 'en',
    });
  });

  it('still answers when the log or the brake settlement fails', async () => {
    const store = new MemoryStore();
    const failingLog = {
      put: async () => {
        throw new Error('dynamo down');
      },
    };
    const handle = createAiHandler({
      provider: new FakeProvider(),
      brake: new SpendBrake(store, 100_000),
      rateLimiter: new RateLimiter(store),
      log: failingLog,
      verifyTurnstile: async () => true,
      hashIp: (ip) => ip,
      context,
      allowedOrigins: [ORIGIN],
      logger: () => {},
    });
    const sink = new MemorySink();
    await handle(
      {
        method: 'POST',
        headers: { origin: ORIGIN },
        sourceIp: '1.1.1.1',
        body: JSON.stringify({
          locale: 'es',
          turnstileToken: 't',
          messages: [{ role: 'user', content: 'hola' }],
        }),
      },
      sink,
    );
    expect(sink.status).toBe(200);
    expect(sink.events.at(-1)?.type).toBe('done');
  });

  it('answers 500 when a dependency throws unexpectedly', async () => {
    const store = new MemoryStore();
    const handle = createAiHandler({
      provider: new FakeProvider(),
      brake: new SpendBrake(store, 100_000),
      rateLimiter: {
        check: async () => {
          throw new Error('dynamo down');
        },
      } as unknown as RateLimiter,
      log: store,
      verifyTurnstile: async () => true,
      hashIp: (ip) => ip,
      context,
      allowedOrigins: [ORIGIN],
      logger: () => {},
    });
    const sink = new MemorySink();
    await handle(
      {
        method: 'POST',
        headers: { origin: ORIGIN },
        sourceIp: '1.1.1.1',
        body: JSON.stringify({
          locale: 'es',
          turnstileToken: 't',
          messages: [{ role: 'user', content: 'hola' }],
        }),
      },
      sink,
    );
    expect(sink.status).toBe(500);
    expect(sink.events[0]).toMatchObject({ code: 'internal' });
    expect(sink.ended).toBe(1);
  });
});
