/**
 * AiProvider backed by the official Anthropic SDK (ADR 0013).
 */
import Anthropic from '@anthropic-ai/sdk';
import { MODEL } from './pricing';
import {
  ProviderError,
  type AiProvider,
  type ProviderEvent,
  type ProviderRequest,
} from './provider';

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  /** Thinking depth. Haiku 5.5 defaults to `medium`; `low` is enough here. */
  effort?: 'low' | 'medium' | 'high';
  /** Per-attempt timeout in ms. */
  timeoutMs?: number;
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError('busy', error.message, error.status);
  }
  if (error instanceof Anthropic.InternalServerError) {
    return new ProviderError('busy', error.message, error.status);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderError('busy', error.message);
  }
  if (error instanceof Anthropic.APIError) {
    // 400 (includes "credit balance too low"), 401, 403, 404...: nothing
    // will change until the author fixes credits, key or request.
    const status = typeof error.status === 'number' ? error.status : undefined;
    const kind = status !== undefined && status >= 500 ? 'busy' : 'unavailable';
    return new ProviderError(kind, error.message, status);
  }
  return new ProviderError(
    'busy',
    error instanceof Error ? error.message : String(error),
  );
}

export class AnthropicProvider implements AiProvider {
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: 'low' | 'medium' | 'high';

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model ?? MODEL;
    this.effort = options.effort ?? 'low';
    this.client = new Anthropic({
      apiKey: options.apiKey,
      maxRetries: 1,
      timeout: options.timeoutMs ?? 30_000,
    });
  }

  async *stream(request: ProviderRequest): AsyncIterable<ProviderEvent> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          output_config: {
            effort: this.effort,
            // Structured outputs work with streaming: the deltas are pieces
            // of the JSON document, complete at `message_stop`.
            ...(request.jsonSchema
              ? {
                  format: {
                    type: 'json_schema' as const,
                    schema: request.jsonSchema,
                  },
                }
              : {}),
          },
          system: [
            { type: 'text', text: request.instructions },
            {
              type: 'text',
              text: request.context,
              // Caches tools + system (instructions and the whole content).
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: request.messages.map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
        },
        { signal: request.signal },
      );

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield { type: 'text', text: event.delta.text };
        }
      }

      const message = await stream.finalMessage();
      yield {
        type: 'end',
        model: message.model,
        stopReason: message.stop_reason ?? 'end_turn',
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
          cacheCreationInputTokens:
            message.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
