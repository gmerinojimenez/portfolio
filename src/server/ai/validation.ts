/**
 * Request body validation. The client chooses nothing but the language and
 * the conversation; everything else (model, max_tokens, prompt) is fixed on
 * the server (ADR 0003, layer 4).
 */
import { isLocale, type Locale } from '../../lib/locales';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  locale: Locale;
  messages: ChatTurn[];
  turnstileToken: string;
}

export interface InputLimits {
  maxBodyBytes: number;
  maxQuestionChars: number;
  maxAnswerChars: number;
  /** Questions (user turns) per conversation. */
  maxQuestions: number;
}

export const DEFAULT_INPUT_LIMITS: InputLimits = {
  maxBodyBytes: 32 * 1024,
  maxQuestionChars: 500,
  maxAnswerChars: 4_000,
  maxQuestions: 6,
};

export type ValidationResult =
  | { ok: true; value: AiRequest }
  | { ok: false; reason: string; locale?: Locale };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateRequest(
  body: string,
  limits: InputLimits = DEFAULT_INPUT_LIMITS,
): ValidationResult {
  if (Buffer.byteLength(body, 'utf8') > limits.maxBodyBytes) {
    return { ok: false, reason: 'body too large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'body is not JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'body must be an object' };

  const { locale, messages, turnstileToken } = parsed;
  if (typeof locale !== 'string' || !isLocale(locale)) {
    return { ok: false, reason: 'locale must be "es" or "en"' };
  }
  const fail = (reason: string): ValidationResult => ({
    ok: false,
    reason,
    locale,
  });

  if (typeof turnstileToken !== 'string') {
    return fail('turnstileToken must be a string');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return fail('messages must be a non-empty array');
  }
  if (messages.length > limits.maxQuestions * 2 - 1) {
    return fail('too many turns');
  }
  if (messages.length % 2 === 0) {
    return fail('the last message must be a user question');
  }

  const turns: ChatTurn[] = [];
  for (const [index, message] of messages.entries()) {
    if (!isRecord(message)) return fail(`messages[${index}] is not an object`);
    const expectedRole = index % 2 === 0 ? 'user' : 'assistant';
    if (message.role !== expectedRole) {
      return fail(`messages[${index}].role must be "${expectedRole}"`);
    }
    if (typeof message.content !== 'string') {
      return fail(`messages[${index}].content must be a string`);
    }
    const content = message.content.trim();
    const max =
      expectedRole === 'user' ? limits.maxQuestionChars : limits.maxAnswerChars;
    if (content.length === 0) return fail(`messages[${index}] is empty`);
    if (content.length > max) return fail(`messages[${index}] is too long`);
    turns.push({ role: expectedRole, content });
  }
  return { ok: true, value: { locale, messages: turns, turnstileToken } };
}
