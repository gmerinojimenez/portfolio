import type { UiStrings } from '../../i18n/ui';
import { fill } from './format';
import { LIMITS, type ErrorCode } from './protocol';

/** Failures that never reach the server, or that the server can't describe. */
export type LocalCode =
  | 'network'
  | 'timeout'
  | 'interrupted'
  | 'bad_response'
  | 'turnstile_unavailable'
  | 'too_long'
  | 'turn_limit';

export type AiErrorCode = ErrorCode | LocalCode;

export interface AiFailure {
  readonly code: AiErrorCode;
  /** The server's message, already in the visitor's language. */
  readonly message?: string | undefined;
  readonly retryAfterSeconds?: number | undefined;
}

const FIVE_MINUTES = 5 * 60_000;

/**
 * How long the AI stays in degraded mode after a failure: no more requests
 * (the visitor just sees the message and the commands) until then. The daily
 * spend limit won't reset before tomorrow, so until the page reloads; an
 * outage or an empty balance gets a short pause instead of a request per
 * question. Everything else is worth retrying right away.
 */
export function degradedForMs(code: AiErrorCode): number {
  switch (code) {
    case 'budget_exhausted':
      return Number.POSITIVE_INFINITY;
    case 'unavailable':
    case 'internal':
      return FIVE_MINUTES;
    default:
      return 0;
  }
}

/** Failures where pointing to the commands is the useful thing to say. */
export function suggestsCommands(code: AiErrorCode): boolean {
  switch (code) {
    case 'rate_limited':
    case 'invalid_request':
    case 'too_long':
    case 'turn_limit':
      return false;
    default:
      return true;
  }
}

/** `45 s`, `3 min`. */
export function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

/**
 * The text for a failure: the server's message when it sent one (it's
 * localized there), otherwise ours. `rate_limited` adds how long to wait.
 */
export function failureText(
  failure: AiFailure,
  t: UiStrings['ai'],
): { text: string } {
  const own = t.errors[failure.code];
  let text = failure.message?.trim() || own;
  text = fill(text, {
    max: String(LIMITS.maxQuestionChars),
    questions: String(LIMITS.maxQuestions),
  });
  if (failure.code === 'rate_limited' && failure.retryAfterSeconds) {
    text += ` ${fill(t.retryIn, { time: formatWait(failure.retryAfterSeconds) })}`;
  }
  return { text };
}
