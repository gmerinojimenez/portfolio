/**
 * Provider seam (architecture.md): the handler only knows this interface, so
 * tests use a fake and S14 can add tools or swap the model without touching
 * the brake, the limits or the wire format.
 */
import type { TokenUsage } from './pricing';
import type { ChatTurn } from './validation';

export interface ProviderRequest {
  /** Fixed instructions (first system block). */
  instructions: string;
  /** The content document (second system block, prompt-cached). */
  context: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: 'text'; text: string }
  | {
      type: 'end';
      usage: TokenUsage;
      /** `end_turn`, `max_tokens`, `refusal`... */
      stopReason: string;
      model: string;
    };

export interface AiProvider {
  readonly model: string;
  stream(request: ProviderRequest): AsyncIterable<ProviderEvent>;
}

/**
 * - `unavailable`: the API rejects us (no credits, bad key, bad request).
 *   Retrying will not help until the author acts.
 * - `busy`: rate limited, overloaded, 5xx or network. Transient.
 */
export type ProviderErrorKind = 'unavailable' | 'busy';

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
