import { pick } from '../../../i18n/ui';
import type { Command } from '../core/types';

export const clear: Command = {
  name: 'clear',
  aliases: ['cls'],
  summary: pick((t) => t.commands.clear.summary),
  run(_input, ctx) {
    ctx.clear();
  },
};
