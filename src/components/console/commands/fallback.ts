import { commandButton } from '../core/blocks';
import { markup } from '../core/html';
import type { FallbackHandler } from '../core/types';

/** Answer for input that isn't a command, until S10 connects the AI. */
export const aiComingSoon: FallbackHandler = (_input, ctx) => {
  ctx.print(
    markup`<p><span class="c-ai" aria-hidden="true">✦ </span>${ctx.t.fallback.aiSoon}${commandButton('help')}</p>`,
  );
};
