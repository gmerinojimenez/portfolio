import type { CommandContext } from '../console/core/types';
import { markup, type Html } from '../console/core/html';
import { renderAnswer, renderSources, type RenderOptions } from './citations';
import { failureText, suggestsCommands, type AiFailure } from './errors';
import { transparencyLine } from './format';
import { clearSuggestion, commandSuggestions } from './notices';
import type { AnswerResult, AnswerView } from './session';

/** Words are revealed at most this fast per word (ms)... */
const WORD_DELAY_MS = 28;
/** ...but a chunk never takes longer than this to appear in full (ms). */
const CHUNK_BUDGET_MS = 900;

let counter = 0;

/**
 * Draws one answer into the console log, in place.
 *
 * Accessibility: the log is a live region, which would read every word as it
 * is appended. While the answer streams, the log is `aria-busy` (set by the
 * caller: screen readers hold their announcements, like pausing
 * `announceForAccessibility`) and the growing text sits in an `aria-hidden`
 * element. When the answer is complete, that element is *replaced* by the
 * final one (a real DOM addition) and `aria-busy` is removed: the whole
 * answer is announced once.
 */
export function createAnswerView(
  ctx: CommandContext,
  log: HTMLElement,
): AnswerView {
  const { t, locale } = ctx;
  const id = `ai-answer-${(counter += 1)}`;
  ctx.print(
    markup`<div class="c-ai-answer" id="${id}"><span class="c-ai c-ai-star" aria-hidden="true">✦</span><div class="c-ai-content"><p class="c-dim" data-ai-status>${t.ai.thinking}</p></div></div>`,
  );
  const content = log.querySelector<HTMLElement>(`#${id} .c-ai-content`);

  const cards = new Map(
    ctx.data.items.map((item) => [
      item.id,
      { title: item.title, path: item.path },
    ]),
  );
  const names = new Set(ctx.registry.completionNames(locale));
  const options = (
    over: Pick<RenderOptions, 'sources'> & Partial<RenderOptions>,
  ): RenderOptions => ({
    cards,
    isCommand: (name) => names.has(name.toLowerCase()),
    ...over,
  });

  let body: HTMLElement | undefined;
  let shown = '';

  const pinned = () => log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  const scroll = (wasPinned: boolean) => {
    if (wasPinned) log.scrollTop = log.scrollHeight;
  };
  const newBody = (hidden: boolean): HTMLElement => {
    const element = document.createElement('div');
    element.className = 'c-ai-body';
    if (hidden) element.setAttribute('aria-hidden', 'true');
    return element;
  };

  /** Swaps the status line and the streaming body for the final body. */
  const settle = (
    text: string,
    sources: AnswerResult['sources'],
  ): HTMLElement => {
    content?.querySelector('[data-ai-status]')?.remove();
    const finalBody = newBody(false);
    if (text.trim()) {
      finalBody.innerHTML = renderAnswer(text, options({ sources })).value;
    }
    if (body?.isConnected) body.replaceWith(finalBody);
    else content?.append(finalBody);
    body = finalBody;
    return finalBody;
  };

  const add = (target: HTMLElement, ...parts: Html[]) => {
    for (const part of parts)
      target.insertAdjacentHTML('beforeend', part.value);
  };

  return {
    async append(delta) {
      if (!content) return;
      if (!body) {
        content.querySelector('[data-ai-status]')?.remove();
        body = newBody(true);
        content.append(body);
      }
      const tokens = delta.match(/\s+|\S+/g) ?? [];
      const words = tokens.filter((token) => /\S/.test(token)).length;
      const pause = Math.max(
        4,
        Math.min(WORD_DELAY_MS, CHUNK_BUDGET_MS / Math.max(words, 1)),
      );
      for (const token of tokens) {
        shown += token;
        if (!/\S/.test(token)) continue;
        const wasPinned = pinned();
        body.innerHTML = renderAnswer(
          shown,
          options({ sources: [], streaming: true }),
        ).value;
        scroll(wasPinned);
        // Resolves at once with reduced motion or when the visitor skips.
        await ctx.sleep(pause);
      }
    },

    finish({ text, done, sources }) {
      const wasPinned = pinned();
      const finalBody = settle(text, sources);
      add(
        finalBody,
        renderSources(sources, options({ sources }), t.ai.sources),
        done.stopReason === 'max_tokens'
          ? markup`<p class="c-dim c-small">${t.ai.cut}</p>`
          : done.stopReason === 'refusal'
            ? markup`<p class="c-dim c-small">${t.ai.refusal}</p>`
            : markup``,
        markup`<p class="c-dim c-small c-ai-meta">${transparencyLine(done, locale, t.ai)}</p>`,
      );
      scroll(wasPinned);
    },

    fail(failure: AiFailure, partial: string) {
      const wasPinned = pinned();
      const finalBody = settle(partial, []);
      add(
        finalBody,
        markup`<p class="c-error c-ai-error">${failureText(failure, t.ai).text}</p>`,
        failure.code === 'turn_limit'
          ? clearSuggestion(ctx)
          : suggestsCommands(failure.code)
            ? commandSuggestions(ctx)
            : markup``,
      );
      scroll(wasPinned);
    },
  };
}
