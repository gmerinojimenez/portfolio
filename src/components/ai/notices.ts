import type { Locale } from '../../lib/locales';
import type { UiStrings } from '../../i18n/ui';
import { commandButton } from '../console/core/blocks';
import { join, markup, type Html } from '../console/core/html';
import type { CommandRegistry } from '../console/core/registry';

/** What a notice needs from the command context. */
export interface NoticeContext {
  readonly registry: CommandRegistry;
  readonly locale: Locale;
  readonly t: UiStrings;
}

/** Clickable command names (in this language) for the ones that exist. */
function buttons(ctx: NoticeContext, names: readonly string[]): Html[] {
  return names.flatMap((name) => {
    const command = ctx.registry.resolve(name);
    if (!command) return [];
    const shown = ctx.registry.displayName(command, ctx.locale);
    return [commandButton(shown)];
  });
}

/** "Meanwhile, try: ls · contact · help": the commands never stop working. */
export function commandSuggestions(ctx: NoticeContext): Html {
  const list = buttons(ctx, ['ls', 'contact', 'help']);
  if (list.length === 0) return markup``;
  return markup`<p class="c-dim c-small">${ctx.t.ai.meanwhile} ${join(list, ' · ')}</p>`;
}

/** A button that runs `clear`, which also starts a new conversation. */
export function clearSuggestion(ctx: NoticeContext): Html {
  const list = buttons(ctx, ['clear']);
  return list.length ? markup`<p class="c-small">${list}</p>` : markup``;
}

/**
 * The console without an AI behind it (the build has no `PUBLIC_AI_URL` or
 * Turnstile key): says so and points to what works.
 */
export function aiNotConfigured(ctx: NoticeContext): Html {
  return markup`<p><span class="c-ai" aria-hidden="true">✦ </span>${ctx.t.ai.notConfigured}</p>${commandSuggestions(ctx)}`;
}
