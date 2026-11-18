import { pick } from '../../../i18n/ui';
import { openCard } from '../../card/controller';
import { commandButton } from '../core/blocks';
import { markup } from '../core/html';
import type { Command } from '../core/types';

/** Ids that look like what was typed: prefix or substring matches first. */
export function suggestIds(
  typed: string,
  ids: readonly string[],
  max = 3,
): string[] {
  const wanted = typed.toLowerCase();
  if (!wanted) return [];
  const starts = ids.filter((id) => id.toLowerCase().startsWith(wanted));
  const contains = ids.filter(
    (id) => !starts.includes(id) && id.toLowerCase().includes(wanted),
  );
  return [...starts, ...contains].slice(0, max);
}

/**
 * `cat <id>` prints a line with a real link to the item's page, and its
 * `enhance` hook (browser only) opens the card. At build time nothing opens.
 */
export const cat: Command = {
  name: 'cat',
  usage: '<id>',
  summary: pick((t) => t.commands.cat.summary),
  complete({ args }, ctx) {
    return args.length === 0 ? ctx.data.items.map((item) => item.id) : [];
  },
  run(input, ctx) {
    const strings = ctx.t.commands.cat;
    const [id] = input.args;
    if (!id) {
      ctx.print(
        markup`<p class="c-dim">${strings.usage}</p><p>${commandButton('ls')}</p>`,
      );
      return;
    }
    const item = ctx.data.items.find(
      (candidate) => candidate.id === id.toLowerCase(),
    );
    if (!item) {
      const ids = ctx.data.items.map((candidate) => candidate.id);
      const suggestions = suggestIds(id, ids);
      const hint = suggestions.length
        ? markup`<p class="c-dim">${strings.suggestions} ${suggestions.map(
            (s) => markup`${commandButton(`cat ${s}`, s)} `,
          )}</p>`
        : markup`<p class="c-dim">${strings.usage} · ${commandButton('ls')}</p>`;
      ctx.print(
        markup`<p class="c-error">${strings.unknown}: ${id}</p>${hint}`,
      );
      return;
    }
    ctx.print(
      markup`<p class="c-dim" data-card-id="${item.id}">${strings.opening} <a class="c-link" href="${item.path}" data-card-open="${item.id}">${item.title}</a></p>`,
    );
  },
  enhance(output, ctx) {
    const id =
      output.querySelector<HTMLElement>('[data-card-id]')?.dataset.cardId;
    if (id) openCard(id, ctx.data.items, ctx.locale);
  },
};
