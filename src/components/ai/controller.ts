import type { ConsoleEvent } from '../console/core/events';
import type { FallbackHandler } from '../console/core/types';
import type { AiConfig } from './config';
import { AiSession } from './session';
import { TurnstileTokens } from './turnstile';
import { createAnswerView } from './view';

export interface AiAssistant {
  /** Plug into `registry.setFallback`: non-command input goes to the AI. */
  readonly fallback: FallbackHandler;
  /** `clear` starts a new conversation. */
  reset(): void;
}

/**
 * Connects the AI to the console: Turnstile for the token, the session for
 * the conversation and the view that draws into the log. Browser only.
 */
export function createAiAssistant(options: {
  readonly config: AiConfig;
  /** The console's log: `aria-busy` lives there. */
  readonly log: HTMLElement;
  /** Where Cloudflare's widget goes (shown only if a challenge needs it). */
  readonly turnstileContainer: () => HTMLElement;
  readonly emit: (event: ConsoleEvent) => void;
}): AiAssistant {
  const { config, log } = options;
  const session = new AiSession({
    url: config.url,
    tokens: new TurnstileTokens(config.siteKey, options.turnstileContainer),
    emit: options.emit,
  });

  return {
    reset: () => session.reset(),
    async fallback(input, ctx) {
      const view = createAnswerView(ctx, log);
      log.setAttribute('aria-busy', 'true');
      try {
        await session.ask(input.raw, ctx.locale, view);
      } finally {
        log.removeAttribute('aria-busy');
      }
    },
  };
}
