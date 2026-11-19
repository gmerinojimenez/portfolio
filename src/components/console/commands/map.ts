import { pick } from '../../../i18n/ui';
import { enhanceMap } from '../../map/enhance';
import { buildTreeModel } from '../../map/model';
import { renderMap } from '../../map/render';
import type { Command } from '../core/types';

/**
 * `map`: the career tree (ADR 0015). `run` draws it as SVG (at build time
 * for the boot, or in the browser) from the visible items and stages;
 * `enhance` adds hover/focus connections, the legend filters and replay.
 */
export const map: Command = {
  name: 'map',
  summary: pick((t) => t.commands.map.summary),
  run(_input, ctx) {
    ctx.print(
      renderMap(buildTreeModel(ctx.data.items, ctx.data.stages, ctx.t), ctx.t),
    );
  },
  enhance(output, ctx) {
    enhanceMap(output, ctx.data, ctx.t);
  },
};
