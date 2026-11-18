import { pick } from '../../../i18n/ui';
import { commandButton } from '../core/blocks';
import { markup } from '../core/html';
import type { Command } from '../core/types';
import { contact } from './contact';

export const cv: Command = {
  name: 'cv',
  summary: pick((t) => t.commands.cv.summary),
  run(_input, ctx) {
    const strings = ctx.t.commands.cv;
    const file = ctx.data.cv;
    if (!file) {
      const contactName = ctx.registry.displayName(contact, ctx.locale);
      ctx.print(
        markup`<p>${strings.missing} ${commandButton(contactName)}</p>`,
      );
      return;
    }
    ctx.print(
      markup`<p>${strings.downloading} ${file.filename}… <a class="c-link" href="${file.url}" download="${file.filename}">${strings.fallbackLink}</a></p>`,
    );
    ctx.download(file.url, file.filename);
  },
};
