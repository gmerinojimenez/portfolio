/**
 * The wire contract with the backend (docs/specs/09-ai-backend.md), seen from
 * the browser. Types come from the server code with `import type`, which the
 * compiler erases: no server code ends up in the browser bundle. Anything the
 * browser needs at runtime (limits, the list of error codes, validation of
 * what arrives) is written here, and the tests check it against the server.
 */
import type { ErrorCode, WireEvent, WireUsage } from '../../server/ai/messages';
import type { SourceRef } from '../../server/ai/context';
import type { OfferAnalysis } from '../../server/ai/offer';
import type {
  AiRequest,
  AnyAiRequest,
  ChatTurn,
  OfferRequest,
} from '../../server/ai/validation';

export type {
  AiRequest,
  AnyAiRequest,
  ChatTurn,
  ErrorCode,
  OfferAnalysis,
  OfferRequest,
  SourceRef,
  WireEvent,
  WireUsage,
};

/** Same numbers as the server's `DEFAULT_INPUT_LIMITS` (checked by a test). */
export const LIMITS = {
  maxQuestions: 6,
  maxQuestionChars: 500,
  maxAnswerChars: 4_000,
  /** Job offer text (S11). */
  maxOfferChars: 8_000,
  /** Analyses per IP and day (server's `OFFER_RATE_LIMITS`). */
  offersPerDay: 5,
} as const;

/** `Record` (not an array) so the compiler flags a code the server adds. */
const SERVER_CODES: Record<ErrorCode, true> = {
  invalid_request: true,
  forbidden_origin: true,
  turnstile_failed: true,
  method_not_allowed: true,
  rate_limited: true,
  budget_exhausted: true,
  unavailable: true,
  internal: true,
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(SERVER_CODES, value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function parseSources(value: unknown): SourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SourceRef[] => {
    if (!isRecord(entry)) return [];
    const { id, kind, title } = entry;
    if (typeof id !== 'string' || !id) return [];
    return [
      {
        id,
        kind: kind === 'note' ? 'note' : 'item',
        title: typeof title === 'string' && title ? title : id,
      },
    ];
  });
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/** An analysis as the browser trusts it: strings and string lists only. */
function parseAnalysis(value: unknown): OfferAnalysis | undefined {
  if (!isRecord(value) || !text(value['summary'])) return undefined;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    summary: text(value['summary']),
    matches: list(value['matches'])
      .filter(isRecord)
      .map((m) => ({
        requirement: text(m['requirement']),
        evidence: text(m['evidence']),
        sources: list(m['sources']).filter(
          (id): id is string => typeof id === 'string',
        ),
      })),
    gaps: list(value['gaps'])
      .filter(isRecord)
      .map((g) => ({
        requirement: text(g['requirement']),
        detail: text(g['detail']),
      })),
    questions: list(value['questions']).filter(
      (q): q is string => typeof q === 'string',
    ),
  };
}

/**
 * Turns one parsed JSON value into a wire event, or `undefined` if it isn't
 * one. The server is ours, but a proxy or a future version could send
 * something else, and a bad line must never crash the console.
 */
export function toWireEvent(value: unknown): WireEvent | undefined {
  if (!isRecord(value)) return undefined;
  switch (value['type']) {
    case 'meta':
      return {
        type: 'meta',
        requestId: String(value['requestId'] ?? ''),
        model: String(value['model'] ?? ''),
      };
    case 'delta':
      return typeof value['text'] === 'string'
        ? { type: 'delta', text: value['text'] }
        : undefined;
    case 'analysis': {
      const analysis = parseAnalysis(value['analysis']);
      return analysis ? { type: 'analysis', analysis } : undefined;
    }
    case 'done': {
      const usage = isRecord(value['usage']) ? value['usage'] : {};
      return {
        type: 'done',
        sources: parseSources(value['sources']),
        stopReason: String(value['stopReason'] ?? 'end_turn'),
        usage: {
          inputTokens: count(usage['inputTokens']),
          outputTokens: count(usage['outputTokens']),
          cacheReadInputTokens: count(usage['cacheReadInputTokens']),
          cacheCreationInputTokens: count(usage['cacheCreationInputTokens']),
        },
        costUsd: count(value['costUsd']),
        latencyMs: count(value['latencyMs']),
        model: String(value['model'] ?? ''),
      };
    }
    case 'error': {
      const retry = value['retryAfterSeconds'];
      return {
        type: 'error',
        code: isErrorCode(value['code']) ? value['code'] : 'internal',
        message: typeof value['message'] === 'string' ? value['message'] : '',
        ...(typeof retry === 'number' && retry > 0
          ? { retryAfterSeconds: Math.ceil(retry) }
          : {}),
      };
    }
    default:
      return undefined;
  }
}
