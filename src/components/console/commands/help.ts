import { pick } from '../../../i18n/ui';
import { commandButton } from '../core/blocks';
import { markup } from '../core/html';
import type { Command } from '../core/types';

export const help: Command = {
  name: 'help',
  summary: pick((t) => t.commands.help.summary),
  run(_input, ctx) {
    const { t, locale, registry } = ctx;
    const rows = registry.visible().map((command) => {
      const name = registry.displayName(command, locale);
      const label = command.usage ? `${name} ${command.usage}` : name;
      return markup`<span>${commandButton(name, label)}</span><span class="c-dim">${command.summary[locale]}</span>`;
    });
    ctx.print(
      markup`<p>${t.commands.help.heading}</p><div class="c-grid">${rows}</div><p class="c-dim">${t.commands.help.footer}</p>`,
    );
  },
};
