import { pick } from '../../../i18n/ui';
import { cvPath } from '../../../lib/cv';
import { markup } from '../core/html';
import type { Command } from '../core/types';

/**
 * Opens the printable CV (S16): the general one, or the version of the
 * visit's `?track=`. There is no PDF file: the page prints to one.
 */
export const cv: Command = {
  name: 'cv',
  summary: pick((t) => t.commands.cv.summary),
  run(_input, ctx) {
    const strings = ctx.t.commands.cv;
    const url = cvPath(ctx.track ?? 'general', ctx.locale);
    ctx.print(
      markup`<p>${strings.opening} <a class="c-link" href="${url}" target="_blank" rel="noopener">${url}</a></p><p class="c-dim">${strings.pdfHint}</p>`,
    );
    ctx.openTab(url);
  },
};
