/**
 * Wire format (NDJSON: one JSON object per line) and the localized messages of
 * degraded responses. The contract is documented in docs/specs/09-ai-backend.md
 * for S10.
 */
import type { Locale } from '../../lib/locales';
import type { SourceRef } from './context';

export type ErrorCode =
  | 'invalid_request'
  | 'forbidden_origin'
  | 'turnstile_failed'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'budget_exhausted'
  | 'unavailable'
  | 'internal';

export const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  forbidden_origin: 403,
  turnstile_failed: 403,
  method_not_allowed: 405,
  rate_limited: 429,
  budget_exhausted: 503,
  unavailable: 503,
  internal: 500,
};

export const MESSAGES: Record<Locale, Record<ErrorCode, string>> = {
  es: {
    invalid_request:
      'No he podido leer la pregunta. Prueba con una más corta (máximo 500 caracteres).',
    forbidden_origin: 'Esta petición no viene de la web del portfolio.',
    turnstile_failed:
      'No he podido comprobar que no eres un bot. Recarga la página y vuelve a intentarlo.',
    method_not_allowed: 'Método no permitido.',
    rate_limited:
      'Has hecho muchas preguntas seguidas. Espera un poco y vuelve a intentarlo.',
    budget_exhausted:
      'La IA ha llegado a su límite de hoy. Mientras tanto, usa los comandos de la consola o escríbeme con `contacto`.',
    unavailable:
      'La IA no está disponible ahora mismo. Usa los comandos de la consola o escríbeme con `contacto`.',
    internal:
      'Algo ha fallado al responder. Usa los comandos de la consola o escríbeme con `contacto`.',
  },
  en: {
    invalid_request:
      'I could not read the question. Try a shorter one (500 characters at most).',
    forbidden_origin: 'This request does not come from the portfolio site.',
    turnstile_failed:
      'I could not verify that you are not a bot. Reload the page and try again.',
    method_not_allowed: 'Method not allowed.',
    rate_limited: 'Too many questions in a row. Wait a moment and try again.',
    budget_exhausted:
      'The AI has reached its limit for today. Meanwhile, use the console commands or reach me with `contact`.',
    unavailable:
      'The AI is not available right now. Use the console commands or reach me with `contact`.',
    internal:
      'Something went wrong while answering. Use the console commands or reach me with `contact`.',
  },
};

export interface WireUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export type WireEvent =
  | { type: 'meta'; requestId: string; model: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      sources: SourceRef[];
      stopReason: string;
      usage: WireUsage;
      costUsd: number;
      latencyMs: number;
      model: string;
    }
  | {
      type: 'error';
      code: ErrorCode;
      message: string;
      retryAfterSeconds?: number;
    };

export const NDJSON = 'application/x-ndjson; charset=utf-8';

export const line = (event: WireEvent): string => `${JSON.stringify(event)}\n`;

export function errorEvent(
  code: ErrorCode,
  locale: Locale,
  retryAfterSeconds?: number,
): WireEvent {
  return {
    type: 'error',
    code,
    message: MESSAGES[locale][code],
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
  };
}
