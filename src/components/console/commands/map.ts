import { pick } from '../../../i18n/ui';
import { markup } from '../core/html';
import type { Command } from '../core/types';

/**
 * Placeholder until S07 registers the real semantic map with
 * `registry.register(map, { replace: true })`.
 */
export const map: Command = {
  name: 'map',
  summary: pick((t) => t.commands.map.summary),
  run(_input, ctx) {
    const strings = ctx.t.commands.map;
    const shapes = markup`<div class="c-map-shapes" aria-hidden="true"><span class="c-cl-android">○ ◎ △</span><span class="c-cl-cloud">○ □ ◇</span><span class="c-cl-ai">◎ ◇ △</span><span class="c-cl-base">□</span></div>`;
    ctx.print(
      markup`<div class="c-map-placeholder">${shapes}<p class="c-title">${strings.title}</p><p class="c-dim">${strings.body}</p></div><p class="c-dim c-small">${strings.legend}</p>`,
    );
  },
};
