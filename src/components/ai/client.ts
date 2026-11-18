import type { AiFailure } from './errors';
import { NdjsonParser } from './ndjson';
import type { AiRequest, ErrorCode, WireEvent } from './protocol';

/** What the controller sees: successful events as they come, or a failure. */
export type StreamEvent =
  | Exclude<WireEvent, { type: 'error' }>
  | { readonly type: 'error'; readonly failure: AiFailure };

export interface StreamOptions {
  readonly url: string;
  readonly request: AiRequest;
  /** Whole-answer deadline. */
  readonly timeoutMs?: number;
  /** Injected in tests. */
  readonly fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Failure for a response whose body we couldn't read, from its status. */
export function failureFromStatus(status: number): AiFailure {
  const code = ((): ErrorCode | 'bad_response' => {
    switch (status) {
      case 400:
        return 'invalid_request';
      case 403:
        return 'forbidden_origin';
      case 405:
        return 'method_not_allowed';
      case 429:
        return 'rate_limited';
      case 500:
        return 'internal';
      default:
        return status >= 500 ? 'unavailable' : 'bad_response';
    }
  })();
  return { code };
}

function fromWire(event: WireEvent): StreamEvent {
  if (event.type !== 'error') return event;
  return {
    type: 'error',
    failure: {
      code: event.code,
      message: event.message,
      retryAfterSeconds: event.retryAfterSeconds,
    },
  };
}

/**
 * Sends a question and yields the answer as it arrives.
 *
 * `fetch` resolves as soon as the response headers are in; `response.body` is
 * a stream we read chunk by chunk (like reading an OkHttp response body with
 * a `Source` instead of `string()`). Every chunk goes through
 * `TextDecoder({ stream: true })`, which holds back the bytes of a UTF-8
 * character cut in half by the chunk boundary, then through the NDJSON
 * parser, which holds back a line cut in half.
 *
 * The HTTP status alone isn't enough: an error can come as the last line of a
 * 200 response (it started streaming, then failed), and the body of a 4xx/5xx
 * is NDJSON too. So the last event decides. A stream that ends without a
 * `done` or an `error` was cut off.
 */
export async function* streamAnswer(
  options: StreamOptions,
): AsyncGenerator<StreamEvent> {
  const { url, request, fetchFn = fetch } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const parser = new NdjsonParser();
  let finished = false;
  let produced = 0;
  const failWith = (failure: AiFailure): StreamEvent => ({
    type: 'error',
    failure,
  });
  const failure = (): AiFailure => ({
    code: timedOut ? 'timeout' : produced > 0 ? 'interrupted' : 'network',
  });

  try {
    let response: Response;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      yield failWith(failure());
      return;
    }

    const handle = function* (events: WireEvent[]): Generator<StreamEvent> {
      for (const event of events) {
        produced += 1;
        if (event.type === 'done' || event.type === 'error') finished = true;
        yield fromWire(event);
        if (finished) return;
      }
    };

    try {
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          yield* handle(parser.push(decoder.decode(value, { stream: true })));
        }
        if (!finished) yield* handle(parser.push(decoder.decode()));
        if (!finished) yield* handle(parser.end());
        if (finished) void reader.cancel().catch(() => undefined);
      } else {
        // No streaming support: wait for everything, then parse it.
        yield* handle(parser.push(await response.text()));
        if (!finished) yield* handle(parser.end());
      }
    } catch {
      if (!finished) yield failWith(failure());
      return;
    }

    if (!finished) {
      yield failWith(
        response.ok
          ? produced > 0
            ? { code: 'interrupted' }
            : { code: 'bad_response' }
          : failureFromStatus(response.status),
      );
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
