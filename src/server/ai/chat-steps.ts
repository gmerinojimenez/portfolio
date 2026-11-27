/**
 * The AI steps of a request, after the HTTP and abuse checks (S18):
 *
 *   scope gate (questions only) -> spend brake -> model (streamed) -> finish
 *
 * Each step takes its dependencies and an `emit` for wire events, and returns
 * what the next one needs. Orchestrators (chat-orchestrator.ts) only decide
 * the order: `direct` calls them in sequence, `langgraph` runs them as graph
 * nodes. Both run this same code, which is what keeps them equivalent.
 *
 * The response ends with the first `done` or `error` event (the handler closes
 * the stream then), so whatever a step does after emitting it (settling the
 * brake, writing the log) never delays the visitor.
 */
import type { Locale } from '../../lib/locales';
import type { SourceRef } from './context';
import { OFF_TOPIC_ANSWER, type ErrorCode, type WireEvent } from './messages';
import { errorEvent } from './messages';
import { analysisSources, parseAnalysis, type OfferAnalysis } from './offer';
import {
  costMicroUsd,
  emptyUsage,
  estimateTokens,
  jevCostMicroUsd,
  maxCostMicroUsd,
  microUsdToUsd,
  type TokenUsage,
} from './pricing';
import { extractSources } from './prompt';
import { ProviderError, type AiProvider } from './provider';
import type { ScopeGate, ScopeGateMode } from './scope-gate';
import type { Reservation, SpendBrake } from './spend-brake';
import type { Outcome, QuestionLog, QuestionLogEntry } from './store';
import type { ChatTurn } from './validation';

export type Emit = (event: WireEvent) => void;

export interface StepDeps {
  provider: AiProvider;
  brake: SpendBrake;
  log: QuestionLog;
  scopeGate?: ScopeGate;
  /** `off` when there is no gate. */
  gateMode: ScopeGateMode;
  logTtlDays: number;
  now: () => Date;
  /** Structured operational log (CloudWatch). Never receives question text. */
  logger: (record: Record<string, unknown>) => void;
}

/** What one request is about. Never holds the IP, its hash or Turnstile. */
export interface RequestInfo {
  requestId: string;
  startedAt: Date;
  locale: Locale;
  mode: 'chat' | 'offer';
  /** Offers only: the validated `?company=`. */
  company?: string;
  /** The question, or the job offer text. */
  question: string;
  turn: number;
}

/** The model call a request makes. */
export interface ModelCall {
  instructions: string;
  /** The locale's content document (prompt-cached). */
  context: string;
  messages: ChatTurn[];
  maxTokens: number;
  jsonSchema?: Record<string, unknown>;
  /** Citable sources of the locale. */
  sources: SourceRef[];
  /** Company and item names, for the scope gate (S17). */
  topics: string[];
}

/** Scope gate fields of the question log; empty when the gate did not run. */
export type GateLog = Partial<QuestionLogEntry>;

const MAX_LOGGED_ANSWER = 2_000;
/** An analysis is JSON with several lists: keep more of it. */
const MAX_LOGGED_ANALYSIS = 6_000;

export async function writeLog(
  deps: StepDeps,
  req: RequestInfo,
  gateLog: GateLog,
  entry: {
    outcome: Outcome;
    answer: string;
    sources: string[];
    usage: TokenUsage;
    cost: number;
    model: string;
  },
): Promise<void> {
  const at = deps.now();
  try {
    await deps.log.put(
      {
        requestId: req.requestId,
        at: req.startedAt.toISOString(),
        locale: req.locale,
        mode: req.mode,
        ...(req.company ? { company: req.company } : {}),
        question: req.question,
        turn: req.turn,
        answer: entry.answer.slice(
          0,
          req.mode === 'offer' ? MAX_LOGGED_ANALYSIS : MAX_LOGGED_ANSWER,
        ),
        sources: entry.sources,
        outcome: entry.outcome,
        model: entry.model,
        ...entry.usage,
        costMicroUsd: entry.cost,
        latencyMs: at.getTime() - req.startedAt.getTime(),
        ...gateLog,
      },
      Math.floor(at.getTime() / 1000) + deps.logTtlDays * 86_400,
    );
  } catch (error) {
    deps.logger({
      requestId: req.requestId,
      warning: 'question log failed',
      error: String(error),
    });
  }
}

/** Sends an error event and logs the outcome, as the handler's rejections do. */
export function emitError(
  deps: StepDeps,
  req: RequestInfo,
  emit: Emit,
  code: ErrorCode,
): void {
  deps.logger({ requestId: req.requestId, outcome: code });
  emit(errorEvent(code, req.locale));
}

export interface GateStepResult {
  gateLog: GateLog;
  /** The gate answered the question itself: nothing else runs. */
  stopped: boolean;
}

/**
 * Scope gate (S17). Questions only; a no-op without a gate or in `off`.
 * In `enforce`, a clear off-topic question gets a fixed answer here.
 */
export async function runGate(
  deps: StepDeps,
  req: RequestInfo,
  call: ModelCall,
  emit: Emit,
): Promise<GateStepResult> {
  if (req.mode === 'offer' || !deps.scopeGate || deps.gateMode === 'off') {
    return { gateLog: {}, stopped: false };
  }
  const result = await deps.scopeGate.check({
    locale: req.locale,
    messages: call.messages,
    topics: call.topics,
  });
  const gateCost = jevCostMicroUsd(result.inputTokens);
  try {
    await deps.brake.charge(gateCost, deps.now());
  } catch (error) {
    deps.logger({
      requestId: req.requestId,
      warning: 'brake charge failed',
      error: String(error),
    });
  }
  const rejects = result.verdict === 'reject';
  const enforced = rejects && deps.gateMode === 'enforce';
  const gateLog: GateLog = {
    gate: rejects && !enforced ? 'shadow_reject' : result.verdict,
    ...(result.verdict === 'error'
      ? { gateError: result.reason }
      : { gateScore: result.inScope }),
    gateModel: result.model,
    gateLatencyMs: result.latencyMs,
    gateCostMicroUsd: gateCost,
  };
  deps.logger({ requestId: req.requestId, mode: req.mode, ...gateLog });
  if (!enforced) return { gateLog, stopped: false };

  const replyLocale =
    (result.verdict === 'reject' ? result.language : undefined) ?? req.locale;
  const text = OFF_TOPIC_ANSWER[replyLocale];
  emit({ type: 'meta', requestId: req.requestId, model: result.model });
  emit({ type: 'delta', text });
  emit({
    type: 'done',
    sources: [],
    stopReason: 'off_topic',
    usage: { ...emptyUsage(), inputTokens: result.inputTokens },
    costUsd: microUsdToUsd(gateCost),
    latencyMs: deps.now().getTime() - req.startedAt.getTime(),
    model: result.model,
  });
  // The log's token and cost fields stay the model's: none here.
  await writeLog(deps, req, gateLog, {
    outcome: 'off_topic',
    answer: text,
    sources: [],
    usage: emptyUsage(),
    cost: 0,
    model: result.model,
  });
  deps.logger({
    requestId: req.requestId,
    outcome: 'off_topic',
    mode: req.mode,
    locale: req.locale,
    turn: req.turn,
  });
  return { gateLog, stopped: true };
}

/**
 * Reserves the call's worst-case cost. Without budget, logs it, answers
 * `budget_exhausted` and returns `null`.
 */
export async function reserveBudget(
  deps: StepDeps,
  req: RequestInfo,
  call: ModelCall,
  gateLog: GateLog,
  emit: Emit,
): Promise<Reservation | null> {
  const estimatedInput = estimateTokens(
    call.instructions +
      call.context +
      call.messages.map((m) => m.content).join('\n'),
  );
  const reservation = await deps.brake.reserve(
    maxCostMicroUsd(estimatedInput, call.maxTokens),
    req.startedAt,
  );
  if (reservation) return reservation;
  await writeLog(deps, req, gateLog, {
    outcome: 'budget_exhausted',
    answer: '',
    sources: [],
    usage: emptyUsage(),
    cost: 0,
    model: deps.provider.model,
  });
  emitError(deps, req, emit, 'budget_exhausted');
  return null;
}

export type AnswerResult =
  | {
      ok: true;
      text: string;
      usage: TokenUsage;
      stopReason: string;
      model: string;
    }
  | {
      ok: false;
      /** What streamed before the failure. */
      text: string;
      /** Whether anything streamed (tokens may have been billed). */
      produced: boolean;
      error: unknown;
    };

/**
 * Streams the model's answer: `meta` with the first event, then a `delta`
 * per text piece (questions only: an analysis is JSON, sent whole later).
 */
export async function streamAnswer(
  deps: StepDeps,
  req: RequestInfo,
  call: ModelCall,
  emit: Emit,
): Promise<AnswerResult> {
  let text = '';
  let produced = false;
  try {
    let end:
      { usage: TokenUsage; stopReason: string; model: string } | undefined;
    for await (const event of deps.provider.stream({
      instructions: call.instructions,
      context: call.context,
      messages: call.messages,
      maxTokens: call.maxTokens,
      ...(call.jsonSchema ? { jsonSchema: call.jsonSchema } : {}),
    })) {
      if (!produced) {
        produced = true;
        emit({
          type: 'meta',
          requestId: req.requestId,
          model: deps.provider.model,
        });
      }
      if (event.type === 'text') {
        text += event.text;
        if (req.mode !== 'offer') emit({ type: 'delta', text: event.text });
      } else {
        end = event;
      }
    }
    if (!end) throw new ProviderError('busy', 'stream ended without usage');
    return { ok: true, text, ...end };
  } catch (error) {
    return { ok: false, text, produced, error };
  }
}

/**
 * Ends the request: on success, sources (and the offer's analysis), `done`,
 * the brake settled with the real cost and the log; on failure, the brake
 * released or kept, the log and an error event.
 */
export async function finishAnswer(
  deps: StepDeps,
  req: RequestInfo,
  call: ModelCall,
  reservation: Reservation,
  result: AnswerResult,
  gateLog: GateLog,
  emit: Emit,
): Promise<void> {
  if (!result.ok) {
    const { error, produced } = result;
    deps.logger({
      requestId: req.requestId,
      outcome: 'provider_error',
      kind: error instanceof ProviderError ? error.kind : 'internal',
      status: error instanceof ProviderError ? error.status : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      if (produced) {
        // Tokens may have been billed: keep the whole reservation.
        await deps.brake.settle(
          reservation,
          reservation.amountMicroUsd,
          deps.now(),
        );
      } else {
        await deps.brake.release(reservation, deps.now());
      }
    } catch (brakeError) {
      deps.logger({
        requestId: req.requestId,
        warning: 'brake update failed',
        error: String(brakeError),
      });
    }
    await writeLog(deps, req, gateLog, {
      outcome: 'provider_error',
      answer: result.text,
      sources: [],
      usage: emptyUsage(),
      cost: produced ? reservation.amountMicroUsd : 0,
      model: deps.provider.model,
    });
    emit(
      errorEvent(
        error instanceof ProviderError ? 'unavailable' : 'internal',
        req.locale,
      ),
    );
    return;
  }

  const isOffer = req.mode === 'offer';
  const cost = costMicroUsd(result.usage);
  let analysis: OfferAnalysis | undefined;
  let sources: SourceRef[];
  if (isOffer) {
    analysis = parseAnalysis(result.text, call.sources);
    sources = analysis ? analysisSources(analysis, call.sources) : [];
    if (analysis) emit({ type: 'analysis', analysis });
  } else {
    sources = extractSources(result.text, call.sources);
  }
  const latencyMs = deps.now().getTime() - req.startedAt.getTime();
  emit({
    type: 'done',
    sources,
    stopReason: result.stopReason,
    usage: result.usage,
    costUsd: microUsdToUsd(cost),
    latencyMs,
    model: result.model,
  });

  try {
    await deps.brake.settle(reservation, cost, deps.now());
  } catch (error) {
    deps.logger({
      requestId: req.requestId,
      warning: 'brake settle failed',
      error: String(error),
    });
  }
  const outcome: Outcome =
    result.stopReason === 'refusal'
      ? 'refusal'
      : result.stopReason === 'max_tokens'
        ? 'max_tokens'
        : 'answered';
  await writeLog(deps, req, gateLog, {
    outcome,
    answer: result.text,
    sources: sources.map((s) => s.id),
    usage: result.usage,
    cost,
    model: result.model,
  });
  deps.logger({
    requestId: req.requestId,
    outcome,
    mode: req.mode,
    ...(isOffer ? { analysis: analysis !== undefined } : {}),
    locale: req.locale,
    turn: req.turn,
    latencyMs,
    costMicroUsd: cost,
    ...result.usage,
  });
}
