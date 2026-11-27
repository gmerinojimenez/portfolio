import { overrideFetchImplementation } from 'langsmith';
import { traceable } from 'langsmith/traceable';
import { afterEach, describe, expect, it } from 'vitest';
import { LangGraphOrchestrator } from './chat-graph';
import type { StepDeps } from './chat-steps';
import { createTracing, hideContext } from './chat-tracing';
import type { WireEvent } from './messages';
import type { AiProvider, ProviderEvent, ProviderRequest } from './provider';
import { SpendBrake } from './spend-brake';
import { MemoryStore } from './store';

const CONTEXT = `<portfolio_content locale="es">${'x'.repeat(40)}</portfolio_content>`;

describe('hideContext', () => {
  it('replaces the content document with its length, anywhere', () => {
    expect(
      hideContext({
        call: { context: CONTEXT, instructions: 'Be brief' },
        system: [{ type: 'text', text: CONTEXT }],
        n: 3,
      }),
    ).toEqual({
      call: {
        context: `[context: ${CONTEXT.length} chars]`,
        instructions: 'Be brief',
      },
      system: [{ type: 'text', text: `[context: ${CONTEXT.length} chars]` }],
      n: 3,
    });
  });
});

interface Posted {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

function captureFetch(respond: () => Promise<Response> | Response) {
  const posted: Posted[] = [];
  overrideFetchImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const raw = init?.body;
    const text =
      typeof raw === 'string'
        ? raw
        : raw instanceof Uint8Array
          ? new TextDecoder().decode(raw)
          : undefined;
    if (text) {
      posted.push({
        method: init?.method ?? 'GET',
        url,
        body: JSON.parse(text) as Record<string, unknown>,
      });
    }
    return respond();
  });
  return posted;
}

/** Stands in for wrapAnthropic: a traceable LLM call inside the provider. */
class TracedProvider implements AiProvider {
  readonly model = 'fake-model';
  private readonly call = traceable(
    async (request: ProviderRequest) => ({ seen: request.messages.length }),
    { name: 'anthropic.messages', run_type: 'llm' },
  );
  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    await this.call(request);
    yield { type: 'text', text: 'Hola' };
    yield {
      type: 'end',
      stopReason: 'end_turn',
      model: 'fake-model',
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
    };
  }
}

function steps(): StepDeps {
  const store = new MemoryStore();
  return {
    provider: new TracedProvider(),
    brake: new SpendBrake(store, 100_000),
    log: store,
    gateMode: 'off',
    logTtlDays: 1,
    now: () => new Date('2026-11-26T10:00:00Z'),
    logger: () => {},
  };
}

const run = {
  req: {
    requestId: 'req-1',
    startedAt: new Date('2026-11-26T10:00:00Z'),
    locale: 'es' as const,
    mode: 'chat' as const,
    question: '¿Ha hecho apps de banca?',
    turn: 1,
  },
  call: {
    instructions: 'Be brief',
    context: CONTEXT,
    messages: [{ role: 'user' as const, content: '¿Ha hecho apps de banca?' }],
    maxTokens: 100,
    sources: [],
    topics: [],
  },
};

describe('LangSmith tracing of the chat graph', () => {
  afterEach(() => overrideFetchImplementation(fetch));

  it('traces the graph in the project, nests the model call and hides the corpus', async () => {
    const posted = captureFetch(() => new Response('{}', { status: 200 }));
    const tracing = createTracing({
      apiKey: 'test-key',
      projectName: 'portfolio-test',
      apiUrl: 'https://langsmith.test',
      autoBatchTracing: false,
    });
    const events: WireEvent[] = [];
    await new LangGraphOrchestrator(steps(), tracing).run(run, (e) =>
      events.push(e),
    );
    expect(events.at(-1)?.type).toBe('done');

    const created = posted.filter((p) => p.method === 'POST');
    expect(
      created.every((p) => p.url.startsWith('https://langsmith.test')),
    ).toBe(true);
    const byName = new Map(created.map((p) => [p.body.name, p.body]));
    const root = byName.get('chat')!;
    expect(root.session_name).toBe('portfolio-test');
    expect(root.parent_run_id).toBeUndefined();
    const answer = byName.get('answer')!;
    const llm = byName.get('anthropic.messages')!;
    expect(llm.parent_run_id).toBe(answer.id);
    expect(llm.trace_id).toBe(root.id);

    const everything = JSON.stringify(posted);
    expect(everything).not.toContain('x'.repeat(40));
    expect(everything).toContain(`[context: ${CONTEXT.length} chars]`);
  });

  it('never fails or blocks the answer when LangSmith is down or slow', async () => {
    captureFetch(() => new Promise<Response>(() => {}));
    const warnings: Record<string, unknown>[] = [];
    const tracing = createTracing({
      apiKey: 'test-key',
      projectName: 'portfolio-test',
      apiUrl: 'https://langsmith.test',
      flushTimeoutMs: 50,
      logger: (record) => warnings.push(record),
    });
    const events: WireEvent[] = [];
    const startedAt = Date.now();
    await new LangGraphOrchestrator(steps(), tracing).run(run, (e) =>
      events.push(e),
    );
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(events.at(-1)?.type).toBe('done');
    expect(warnings).toContainEqual(
      expect.objectContaining({ warning: 'langsmith flush timed out' }),
    );
  });

  it('keeps answering when LangSmith rejects the traces', async () => {
    captureFetch(() => {
      throw new Error('network down');
    });
    const tracing = createTracing({
      apiKey: 'test-key',
      projectName: 'portfolio-test',
      apiUrl: 'https://langsmith.test',
      flushTimeoutMs: 200,
      logger: () => {},
    });
    const events: WireEvent[] = [];
    await new LangGraphOrchestrator(steps(), tracing).run(run, (e) =>
      events.push(e),
    );
    expect(events.map((e) => e.type)).toEqual(['meta', 'delta', 'done']);
  });

  it('does not trace model calls outside the graph (job offers go direct)', async () => {
    const posted = captureFetch(() => new Response('{}', { status: 200 }));
    createTracing({
      apiKey: 'test-key',
      projectName: 'portfolio-test',
      apiUrl: 'https://langsmith.test',
      autoBatchTracing: false,
    });
    for await (const event of new TracedProvider().stream(run.call)) {
      void event;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(posted).toEqual([]);
  });
});
