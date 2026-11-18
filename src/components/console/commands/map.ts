import mapJson from '../../../data/map.json';
import { pick } from '../../../i18n/ui';
import { enhanceMap } from '../../map/enhance';
import { buildMapModel, type MapData } from '../../map/model';
import { renderMap } from '../../map/render';
import type { Command } from '../core/types';

const mapData: MapData = mapJson;

/**
 * `map`: the semantic map (S07). `run` draws it as SVG (at build time for
 * the boot, or in the browser), joining `map.json` with the visible items;
 * `enhance` adds hover/focus connections and the legend filters.
 */
export const map: Command = {
  name: 'map',
  summary: pick((t) => t.commands.map.summary),
  run(_input, ctx) {
    ctx.print(renderMap(buildMapModel(mapData, ctx.data.items), ctx.t));
  },
  enhance(output, ctx) {
    enhanceMap(output, mapData, ctx.data.items, ctx.t);
  },
};
