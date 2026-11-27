/**
 * The AI endpoint, independent of Lambda: takes a plain request and writes
 * NDJSON lines to a sink. lambda.ts adapts it to a streaming Function URL;
 * tests drive it with in-memory fakes.
 *
 * Order of checks, cheapest and most protective first:
 *   method -> origin -> body -> per-IP limit -> Turnstile -> scope gate
 *   -> spend brake -> model (streamed) -> settle the brake -> question log.
 *
 * The handler does the HTTP and abuse checks (up to Turnstile). The AI steps
 * that follow live in chat-steps.ts, chained by an orchestrator (S18).
 *
 * The scope gate (S17) only runs on questions, after the limits so nobody can
 * spend gate calls without passing them. In `enforce` mode a clear off-topic
 * question gets a fixed answer and never reaches the model; a gate failure
 * lets the question through.
 *
 * Two modes share that pipeline: questions (`chat`, S09), whose answer
 * streams as `delta` lines, and job offers (`offer`, S11), whose structured
 * answer is parsed when complete and sent as one `analysis` line. Offers have
 * their own, stricter per-IP limit.
 */
import { randomUUID } from 'node:crypto';
import type { Locale } from '../../lib/locales';
import {
  DirectOrchestrator,
  type ChatOrchestrator,
  type ChatRun,
} from './chat-orchestrator';
import type { StepDeps } from './chat-steps';
import type { AiContextFile } from './context';
import {
  NDJSON,
  STATUS,
  errorEvent,
  line,
  type ErrorCode,
  type WireEvent,
} from './messages';
import {
  OFFER_MAX_TOKENS,
  offerInstructions,
  offerMessage,
  offerSchema,
} from './offer';
import { systemInstructions } from './prompt';
import type { AiProvider } from './provider';
import type { RateLimiter } from './rate-limit';
import type { ScopeGate, ScopeGateMode } from './scope-gate';
import type { SpendBrake } from './spend-brake';
import type { QuestionLog } from './store';
import type { TurnstileVerifier } from './turnstile';
import {
  DEFAULT_INPUT_LIMITS,
  validateRequest,
  type InputLimits,
} from './validation';

export interface HttpRequest {
  method: string;
  /** Lowercase header names. */
  headers: Record<string, string | undefined>;
  body: string;
  sourceIp: string;
}

export interface ResponseSink {
  /** Called exactly once, before the first write. */
  start(status: number, headers: Record<string, string>): void;
  write(chunk: string): void;
  end(): void;
}

export interface HandlerDeps {
  provider: AiProvider;
  brake: SpendBrake;
  rateLimiter: RateLimiter;
  /** Per-IP limit for job offer analyses (S11). */
  offerRateLimiter: RateLimiter;
  log: QuestionLog;
  verifyTurnstile: TurnstileVerifier;
  hashIp: (ip: string) => string;
  context: AiContextFile;
  /** Scope gate for questions (S17). Without it, or in `off`, it never runs. */
  scopeGate?: ScopeGate;
  scopeGateMode?: ScopeGateMode;
  /** Exact `Origin` values allowed. Empty = reject everything (fail closed). */
  allowedOrigins: string[];
  maxTokens?: number;
  offerMaxTokens?: number;
  inputLimits?: InputLimits;
  logTtlDays?: number;
  now?: () => Date;
  newRequestId?: () => string;
  /** Structured operational log (CloudWatch). Never receives question text. */
  logger?: (record: Record<string, unknown>) => void;
  /**
   * Who chains the AI steps of a question (S18). Default: `direct`. Job
   * offers always go direct.
   */
  createChatOrchestrator?: (steps: StepDeps) => ChatOrchestrator;
}

export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_LOG_TTL_DAYS = 90;

const baseHeaders = {
  'content-type': NDJSON,
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function createAiHandler(deps: HandlerDeps) {
  const now = deps.now ?? (() => new Date());
  const newRequestId = deps.newRequestId ?? randomUUID;
  const logger =
    deps.logger ?? ((record) => console.log(JSON.stringify(record)));
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  const offerMaxTokens = deps.offerMaxTokens ?? OFFER_MAX_TOKENS;
  const logTtlDays = deps.logTtlDays ?? DEFAULT_LOG_TTL_DAYS;
  const gateMode: ScopeGateMode = deps.scopeGate
    ? (deps.scopeGateMode ?? 'off')
    : 'off';
  const steps: StepDeps = {
    provider: deps.provider,
    brake: deps.brake,
    log: deps.log,
    ...(deps.scopeGate ? { scopeGate: deps.scopeGate } : {}),
    gateMode,
    logTtlDays,
    now,
    logger,
  };
  const direct = new DirectOrchestrator(steps);
  const chat = deps.createChatOrchestrator?.(steps) ?? direct;

  return async function handle(
    request: HttpRequest,
    sink: ResponseSink,
  ): Promise<void> {
    const startedAt = now();
    const requestId = newRequestId();
    let started = false;
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      sink.end();
    };
    const start = (status: number) => {
      if (started) return;
      started = true;
      sink.start(status, baseHeaders);
    };
    const send = (event: WireEvent) => sink.write(line(event));
    // Steps emit wire events; the first sets the status, and `done` or
    // `error` ends the response (what follows never delays the visitor).
    const emit = (event: WireEvent) => {
      if (ended) return;
      start(event.type === 'error' ? STATUS[event.code] : 200);
      send(event);
      if (event.type === 'done' || event.type === 'error') finish();
    };
    const reject = (
      code: ErrorCode,
      locale: Locale,
      retryAfterSeconds?: number,
    ) => {
      logger({ requestId, outcome: code });
      start(STATUS[code]);
      send(errorEvent(code, locale, retryAfterSeconds));
      finish();
    };

    try {
      if (request.method !== 'POST') {
        return reject('method_not_allowed', 'es');
      }
      const origin = request.headers.origin;
      if (!origin || !deps.allowedOrigins.includes(origin)) {
        return reject('forbidden_origin', 'es');
      }

      const parsed = validateRequest(
        request.body,
        deps.inputLimits ?? DEFAULT_INPUT_LIMITS,
      );
      if (!parsed.ok) {
        return reject('invalid_request', parsed.locale ?? 'es');
      }
      const value = parsed.value;
      const { locale, turnstileToken } = value;
      const isOffer = value.mode === 'offer';
      const limiter = isOffer ? deps.offerRateLimiter : deps.rateLimiter;

      const limit = await limiter.check(
        deps.hashIp(request.sourceIp),
        startedAt,
      );
      if (!limit.allowed) {
        return reject('rate_limited', locale, limit.retryAfterSeconds);
      }

      if (!(await deps.verifyTurnstile(turnstileToken))) {
        return reject('turnstile_failed', locale);
      }

      const context = deps.context.locales[locale];
      // What each mode sends to the model. The company of an offer only
      // goes in the user message (see offer.ts).
      const run: ChatRun =
        value.mode === 'offer'
          ? {
              req: {
                requestId,
                startedAt,
                locale,
                mode: 'offer',
                ...(value.company ? { company: value.company } : {}),
                question: value.offer,
                turn: 1,
              },
              call: {
                instructions: offerInstructions(locale),
                context: context.document,
                messages: [
                  {
                    role: 'user',
                    content: offerMessage(value.offer, value.company),
                  },
                ],
                maxTokens: offerMaxTokens,
                jsonSchema: offerSchema(context.sources),
                sources: context.sources,
                topics: [],
              },
            }
          : {
              req: {
                requestId,
                startedAt,
                locale,
                mode: 'chat',
                question: value.messages.at(-1)?.content ?? '',
                turn: Math.ceil(value.messages.length / 2),
              },
              call: {
                instructions: systemInstructions(locale),
                context: context.document,
                messages: value.messages,
                maxTokens,
                sources: context.sources,
                topics: context.topics ?? [],
              },
            };

      // Job offers always take the direct path (ADR 0016).
      const orchestrator = isOffer ? direct : chat;
      await orchestrator.run(run, emit);
    } catch (error) {
      logger({ requestId, outcome: 'internal', error: String(error) });
      if (!started) {
        start(STATUS.internal);
        send(errorEvent('internal', 'es'));
      }
      finish();
    }
  };
}
