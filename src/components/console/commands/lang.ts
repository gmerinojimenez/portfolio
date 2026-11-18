import { pick } from '../../../i18n/ui';
import { switchLocalePath } from '../../../i18n/paths';
import { isLocale, locales } from '../../../lib/locales';
import { markup } from '../core/html';
import type { Command } from '../core/types';

export const lang: Command = {
  name: 'lang',
  usage: 'es|en',
  summary: pick((t) => t.commands.lang.summary),
  accepts: (input) => input.args.length <= 1,
  complete({ args }) {
    return args.length === 0 ? [...locales] : [];
  },
  run(input, ctx) {
    const strings = ctx.t.commands.lang;
    const usage = markup`<p class="c-dim">${strings.usage}</p>`;
    const [target, ...extra] = input.args.map((a) => a.toLowerCase());
    if (target === undefined) {
      ctx.print(markup`<p>${strings.current}</p>${usage}`);
      return;
    }
    if (!isLocale(target) || extra.length > 0) {
      ctx.print(
        markup`<p class="c-error">${strings.unknown} ${input.argText}</p>${usage}`,
      );
      return;
    }
    if (target === ctx.locale) {
      ctx.print(markup`<p class="c-dim">${strings.already}</p>`);
      return;
    }
    const url = switchLocalePath(ctx.pathname, target);
    ctx.print(
      markup`<p class="c-dim">${strings.switching} ${strings.names[target]} → ${url}</p>`,
    );
    ctx.navigate(url);
  },
};
