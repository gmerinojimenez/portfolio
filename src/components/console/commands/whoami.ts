import { pick } from '../../../i18n/ui';
import { markup } from '../core/html';
import type { Command } from '../core/types';

export const whoami: Command = {
  name: 'whoami',
  summary: pick((t) => t.commands.whoami.summary),
  run(_input, ctx) {
    const { name, headline, intro } = ctx.data.profile;
    // The build-time boot output holds the page's only <h1>; later runs in
    // the browser use a paragraph so the page keeps a single main heading.
    const title = ctx.interactive
      ? markup`<p class="c-hero-name">${name}</p>`
      : markup`<h1 class="c-hero-name">${name}</h1>`;
    const lines = intro.map((line) => markup`<p class="c-dim">${line}</p>`);
    ctx.print(
      markup`<div class="c-hero">${title}<p class="c-hero-headline">${headline}</p>${lines}</div>`,
    );
  },
};
