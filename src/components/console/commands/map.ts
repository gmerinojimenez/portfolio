import { pick, type UiStrings } from '../../../i18n/ui';
import { fill } from '../../ai/format';
import { enhanceMap } from '../../map/enhance';
import { buildTreeModel, type TreeOptions } from '../../map/model';
import { renderMap } from '../../map/render';
import type { ConsoleData } from '../data';
import type { Command, CommandContext } from '../core/types';

/** The future node for a `?company=` visit (S11); none without one. */
export function futureOptions(
  t: UiStrings,
  data: Pick<ConsoleData, 'profile'>,
  company: string | undefined,
): TreeOptions {
  if (!company) return {};
  const name = data.profile.name.split(' ')[0] ?? data.profile.name;
  return {
    future: {
      label: fill(t.commands.map.future, { company }),
      prompt: fill(t.ai.whyHire, { company, name }),
    },
  };
}

const modelFor = (ctx: CommandContext) =>
  buildTreeModel(
    ctx.data.items,
    ctx.data.stages,
    ctx.t,
    futureOptions(ctx.t, ctx.data, ctx.company),
  );

/**
 * `map`: the career tree (ADR 0015). `run` draws it as SVG (at build time
 * for the boot, or in the browser) from the visible items and stages;
 * `enhance` adds hover/focus connections, the legend filters and replay.
 * With `?company=`, the browser redraws the build-time tree once with the
 * future node on top (S11).
 */
export const map: Command = {
  name: 'map',
  summary: pick((t) => t.commands.map.summary),
  run(_input, ctx) {
    ctx.print(renderMap(modelFor(ctx), ctx.t));
  },
  enhance(output, ctx) {
    const current = output.querySelector('[data-map]');
    if (
      ctx.company &&
      current &&
      !current.querySelector('[data-company-node]')
    ) {
      const template = document.createElement('template');
      template.innerHTML = renderMap(modelFor(ctx), ctx.t).value;
      const fresh = template.content.firstElementChild;
      if (fresh) current.replaceWith(fresh);
    }
    enhanceMap(
      output,
      ctx.data,
      ctx.t,
      ctx.company ? modelFor(ctx) : undefined,
    );
  },
};
