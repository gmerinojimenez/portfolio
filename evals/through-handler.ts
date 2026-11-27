/**
 * Runs eval questions through the real handler (S18), so the orchestrator is
 * what gets evaluated, not only the provider: same steps, NDJSON and brake as
 * the Lambda, with an in-memory store, Turnstile accepted and no per-IP limits.
 */
import type { StepDeps } from '../src/server/ai/chat-steps';
import type { ChatOrchestrator } from '../src/server/ai/chat-orchestrator';
import type { AiContextFile } from '../src/server/ai/context';
import { createAiHandler, type ResponseSink } from '../src/server/ai/handler';
import type { WireEvent } from '../src/server/ai/messages';
import { emptyUsage, type TokenUsage } from '../src/server/ai/pricing';
import type { AiProvider } from '../src/server/ai/provider';
import { RateLimiter } from '../src/server/ai/rate-limit';
import type { ScopeGate } from '../src/server/ai/scope-gate';
import { SpendBrake } from '../src/server/ai/spend-brake';
import { MemoryStore } from '../src/server/ai/store';
import type { ChatTurn } from '../src/server/ai/validation';

const ORIGIN = 'https://eval.local';
const UNLIMITED = { perMinute: 1_000_000, perDay: 1_000_000 };

export interface HandlerAnswer {
  answer: string;
  stopReason: string;
  usage: TokenUsage;
  /** What the response reported: model plus gate, in USD. */
  costUsd: number;
  /** Time to the first `delta`, as the visitor sees it. */
  firstDeltaMs: number | null;
  totalMs: number;
  error?: string;
}

export function createEvalHandler(options: {
  provider: AiProvider;
  context: AiContextFile;
  scopeGate?: ScopeGate;
  createChatOrchestrator?: (steps: StepDeps) => ChatOrchestrator;
}) {
  const store = new MemoryStore();
  const handle = createAiHandler({
    provider: options.provider,
    brake: new SpendBrake(store, 1_000_000_000),
    rateLimiter: new RateLimiter(store, UNLIMITED),
    offerRateLimiter: new RateLimiter(store, UNLIMITED, 'offer'),
    log: store,
    verifyTurnstile: async () => true,
    hashIp: (ip) => ip,
    context: options.context,
    ...(options.scopeGate
      ? { scopeGate: options.scopeGate, scopeGateMode: 'enforce' as const }
      : {}),
    allowedOrigins: [ORIGIN],
    logger: () => {},
    ...(options.createChatOrchestrator
      ? { createChatOrchestrator: options.createChatOrchestrator }
      : {}),
  });

  return async function ask(
    locale: 'es' | 'en',
    messages: ChatTurn[],
  ): Promise<HandlerAnswer> {
    const startedAt = performance.now();
    let firstDeltaMs: number | null = null;
    let buffer = '';
    const events: WireEvent[] = [];
    const sink: ResponseSink = {
      start: () => {},
      write: (chunk) => {
        buffer += chunk;
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const event = JSON.parse(buffer.slice(0, newline)) as WireEvent;
          buffer = buffer.slice(newline + 1);
          if (event.type === 'delta' && firstDeltaMs === null) {
            firstDeltaMs = Math.round(performance.now() - startedAt);
          }
          events.push(event);
          newline = buffer.indexOf('\n');
        }
      },
      end: () => {},
    };
    await handle(
      {
        method: 'POST',
        headers: { origin: ORIGIN },
        sourceIp: '192.0.2.1',
        body: JSON.stringify({ locale, turnstileToken: 'eval', messages }),
      },
      sink,
    );
    const totalMs = Math.round(performance.now() - startedAt);
    const answer = events
      .map((e) => (e.type === 'delta' ? e.text : ''))
      .join('');
    const done = events.find((e) => e.type === 'done');
    const failure = events.find((e) => e.type === 'error');
    return {
      answer,
      stopReason: done?.type === 'done' ? done.stopReason : 'error',
      usage: done?.type === 'done' ? done.usage : emptyUsage(),
      costUsd: done?.type === 'done' ? done.costUsd : 0,
      firstDeltaMs,
      totalMs,
      ...(failure?.type === 'error' ? { error: failure.code } : {}),
    };
  };
}
