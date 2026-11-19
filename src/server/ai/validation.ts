/**
 * Request body validation. The client chooses nothing but the language and
 * the conversation; everything else (model, max_tokens, prompt) is fixed on
 * the server (ADR 0003, layer 4).
 */
import { sanitizeCompany } from '../../lib/company';
import { isLocale, type Locale } from '../../lib/locales';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** A question in a conversation (S09). `mode` is optional: `"chat"`. */
export interface AiRequest {
  mode?: 'chat';
  locale: Locale;
  messages: ChatTurn[];
  turnstileToken: string;
}

/** A job offer to analyze (S11): one shot, no conversation. */
export interface OfferRequest {
  mode: 'offer';
  locale: Locale;
  /** Validated with `sanitizeCompany`; absent when the visit had none. */
  company?: string;
  offer: string;
  turnstileToken: string;
}

export type AnyAiRequest = AiRequest | OfferRequest;

export interface InputLimits {
  maxBodyBytes: number;
  maxQuestionChars: number;
  maxAnswerChars: number;
  /** Questions (user turns) per conversation. */
  maxQuestions: number;
  /** Job offer text (S11), after trimming. */
  maxOfferChars: number;
}

export const DEFAULT_INPUT_LIMITS: InputLimits = {
  // Room for an 8,000-character offer (S11) even if every character took
  // 3 bytes of UTF-8, plus JSON escapes for its line breaks.
  maxBodyBytes: 40 * 1024,
  maxQuestionChars: 500,
  maxAnswerChars: 4_000,
  maxQuestions: 6,
  maxOfferChars: 8_000,
};

export type ValidationResult =
  | { ok: true; value: AnyAiRequest }
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

  const { mode } = parsed;
  if (mode === 'offer') {
    const { offer, company } = parsed;
    if (typeof offer !== 'string') return fail('offer must be a string');
    const text = offer.trim();
    if (text.length === 0) return fail('offer is empty');
    if (text.length > limits.maxOfferChars) return fail('offer is too long');
    let validCompany: string | undefined;
    if (company !== undefined && company !== null) {
      validCompany =
        typeof company === 'string' ? sanitizeCompany(company) : undefined;
      if (!validCompany) return fail('company is not valid');
    }
    return {
      ok: true,
      value: {
        mode: 'offer',
        locale,
        ...(validCompany ? { company: validCompany } : {}),
        offer: text,
        turnstileToken,
      },
    };
  }
  if (mode !== undefined && mode !== 'chat') {
    return fail('mode must be "chat" or "offer"');
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
