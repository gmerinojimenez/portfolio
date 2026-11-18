/**
 * The AI endpoint, independent of Lambda: takes a plain request and writes
 * NDJSON lines to a sink. lambda.ts adapts it to a streaming Function URL;
 * tests drive it with in-memory fakes.
 *
 * Order of checks, cheapest and most protective first:
 *   method -> origin -> body -> per-IP limit -> Turnstile -> spend brake
 *   -> model (streamed) -> settle the brake -> question log.
 */
import { randomUUID } from 'node:crypto';
import type { Locale } from '../../lib/locales';
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
  costMicroUsd,
  emptyUsage,
  estimateTokens,
  maxCostMicroUsd,
  microUsdToUsd,
  type TokenUsage,
} from './pricing';
import { extractSources, systemInstructions } from './prompt';
import { ProviderError, type AiProvider } from './provider';
import type { RateLimiter } from './rate-limit';
import type { SpendBrake } from './spend-brake';
import type { Outcome, QuestionLog } from './store';
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
  log: QuestionLog;
  verifyTurnstile: TurnstileVerifier;
  hashIp: (ip: string) => string;
  context: AiContextFile;
  /** Exact `Origin` values allowed. Empty = reject everything (fail closed). */
  allowedOrigins: string[];
  maxTokens?: number;
  inputLimits?: InputLimits;
  logTtlDays?: number;
  now?: () => Date;
  newRequestId?: () => string;
  /** Structured operational log (CloudWatch). Never receives question text. */
  logger?: (record: Record<string, unknown>) => void;
}

export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_LOG_TTL_DAYS = 90;
const MAX_LOGGED_ANSWER = 2_000;

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
  const logTtlDays = deps.logTtlDays ?? DEFAULT_LOG_TTL_DAYS;

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
      const { locale, messages, turnstileToken } = parsed.value;

      const limit = await deps.rateLimiter.check(
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
      const instructions = systemInstructions(locale);
      const question = messages[messages.length - 1]?.content ?? '';
      const turn = Math.ceil(messages.length / 2);

      const writeLog = async (
        outcome: Outcome,
        answer: string,
        sources: string[],
        usage: TokenUsage,
        cost: number,
        model: string,
      ) => {
        const at = now();
        try {
          await deps.log.put(
            {
              requestId,
              at: startedAt.toISOString(),
              locale,
              question,
              turn,
              answer: answer.slice(0, MAX_LOGGED_ANSWER),
              sources,
              outcome,
              model,
              ...usage,
              costMicroUsd: cost,
              latencyMs: at.getTime() - startedAt.getTime(),
            },
            Math.floor(at.getTime() / 1000) + logTtlDays * 86_400,
          );
        } catch (error) {
          logger({
            requestId,
            warning: 'question log failed',
            error: String(error),
          });
        }
      };

      const estimatedInput = estimateTokens(
        instructions +
          context.document +
          messages.map((m) => m.content).join('\n'),
      );
      const reservation = await deps.brake.reserve(
        maxCostMicroUsd(estimatedInput, maxTokens),
        startedAt,
      );
      if (!reservation) {
        await writeLog(
          'budget_exhausted',
          '',
          [],
          emptyUsage(),
          0,
          deps.provider.model,
        );
        return reject('budget_exhausted', locale);
      }

      let answer = '';
      let produced = false;
      let end:
        { usage: TokenUsage; stopReason: string; model: string } | undefined;

      try {
        for await (const event of deps.provider.stream({
          instructions,
          context: context.document,
          messages,
          maxTokens,
        })) {
          if (!produced) {
            produced = true;
            start(200);
            send({ type: 'meta', requestId, model: deps.provider.model });
          }
          if (event.type === 'text') {
            answer += event.text;
            send({ type: 'delta', text: event.text });
          } else {
            end = event;
          }
        }
        if (!end) throw new ProviderError('busy', 'stream ended without usage');
      } catch (error) {
        const kind = error instanceof ProviderError ? error.kind : 'internal';
        logger({
          requestId,
          outcome: 'provider_error',
          kind,
          status: error instanceof ProviderError ? error.status : undefined,
          error: error instanceof Error ? error.message : String(error),
        });
        try {
          if (produced) {
            // Tokens may have been billed: keep the whole reservation.
            await deps.brake.settle(
              reservation,
              reservation.amountMicroUsd,
              now(),
            );
          } else {
            await deps.brake.release(reservation, now());
          }
        } catch (brakeError) {
          logger({
            requestId,
            warning: 'brake update failed',
            error: String(brakeError),
          });
        }
        await writeLog(
          'provider_error',
          answer,
          [],
          emptyUsage(),
          produced ? reservation.amountMicroUsd : 0,
          deps.provider.model,
        );
        const code: ErrorCode =
          error instanceof ProviderError ? 'unavailable' : 'internal';
        start(STATUS[code]);
        send(errorEvent(code, locale));
        finish();
        return;
      }

      const cost = costMicroUsd(end.usage);
      const sources = extractSources(answer, context.sources);
      const latencyMs = now().getTime() - startedAt.getTime();
      send({
        type: 'done',
        sources,
        stopReason: end.stopReason,
        usage: end.usage,
        costUsd: microUsdToUsd(cost),
        latencyMs,
        model: end.model,
      });
      finish();

      try {
        await deps.brake.settle(reservation, cost, now());
      } catch (error) {
        logger({
          requestId,
          warning: 'brake settle failed',
          error: String(error),
        });
      }
      const outcome: Outcome =
        end.stopReason === 'refusal'
          ? 'refusal'
          : end.stopReason === 'max_tokens'
            ? 'max_tokens'
            : 'answered';
      await writeLog(
        outcome,
        answer,
        sources.map((s) => s.id),
        end.usage,
        cost,
        end.model,
      );
      logger({
        requestId,
        outcome,
        locale,
        turn,
        latencyMs,
        costMicroUsd: cost,
        ...end.usage,
      });
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
