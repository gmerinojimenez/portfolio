/**
 * The map as HTML + inline SVG. A pure template (S03's `markup`), so it runs
 * at build time for the boot output and in the browser for a typed `map`,
 * and the result is the same. Everything works without JavaScript: nodes are
 * real links and the list alternative is a native `<details>`.
 *
 * Markup stays on one line per element on purpose: the console log keeps
 * whitespace in some places.
 */
import type { ItemType } from '../../lib/content-schema';
import type { UiStrings } from '../../i18n/ui';
import { commandButton } from '../console/core/blocks';
import { markup, type Html } from '../console/core/html';
import {
  CANVAS,
  clusterShape,
  curvePath,
  LABEL_FONT_SIZE,
  labelText,
  nodePosition,
  nodeRadius,
  placeLabels,
  shapePath,
  type PlacedLabel,
} from './geometry';
import { edgeKey } from './filters';
import {
  countBy,
  labeledAtRest,
  TYPE_ORDER,
  type ClusterId,
  type Layout,
  type MapCluster,
  type MapModel,
  type MapNode,
} from './model';

type Strings = Pick<UiStrings, 'commands' | 'card' | 'reading'>;

export function clusterName(id: ClusterId, t: Strings): string {
  return t.reading.topics[id];
}

/** "Proyecto: Offline sync, 2021 – 2022. Android" */
export function nodeName(
  node: Pick<MapNode, 'type' | 'title' | 'dates' | 'cluster'>,
  t: Strings,
): string {
  const dates = node.dates ? `, ${node.dates}` : '';
  return `${t.card.types[node.type]}: ${node.title}${dates}. ${clusterName(node.cluster, t)}`;
}

/** Small shape icon for the legend, lists and the connections panel. */
export function swatch(type: ItemType): Html {
  const r = 6;
  return markup`<svg class="m-swatch" viewBox="-9 -9 18 18" aria-hidden="true" focusable="false"><path d="${shapePath(type, r)}"/>${type === 'project' ? markup`<circle class="m-dot" r="2.4"/>` : ''}</svg>`;
}

function renderNode(
  node: MapNode,
  at: { x: number; y: number },
  label: PlacedLabel | undefined,
  layout: Layout,
  t: Strings,
): Html {
  const r = nodeRadius(node.importance, layout);
  const hit = Math.max(r + 6, layout === 'mobile' ? 20 : 14);
  const classes = [
    'm-node',
    `m-cl-${node.cluster}`,
    label?.atRest ? 'is-labeled' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const text = label
    ? markup`<text class="m-label" x="${label.dx}" y="${label.dy}" text-anchor="${label.anchor}" font-size="${LABEL_FONT_SIZE}" aria-hidden="true">${labelText(node.title)}</text>`
    : '';
  return markup`<a class="${classes}" href="${node.path}" data-card-open="${node.id}" data-node="${node.id}" data-type="${node.type}" data-cluster="${node.cluster}" aria-label="${nodeName(node, t)}" transform="translate(${at.x} ${at.y})"><circle class="m-hit" r="${hit}"/><circle class="m-ring" r="${r + 4}"/><path class="m-shape" d="${shapePath(node.type, r)}"/>${node.type === 'project' ? markup`<circle class="m-dot" r="${Math.round(r * 4) / 10}"/>` : ''}${text}</a>`;
}

/** One SVG per layout; CSS shows the one that fits the screen. */
export function renderSvg(model: MapModel, layout: Layout, t: Strings): Html {
  const canvas = CANVAS[layout];
  const clusters = new Map<ClusterId, MapCluster>(
    model.clusters.map((c) => [c.id, c]),
  );
  const positions = new Map(
    model.nodes.flatMap((node) => {
      const cluster = clusters.get(node.cluster);
      return cluster ? [[node.id, nodePosition(node, cluster, layout)]] : [];
    }),
  );
  const labels = placeLabels(
    model.nodes.flatMap((node) => {
      const at = positions.get(node.id);
      return at
        ? [
            {
              id: node.id,
              text: labelText(node.title),
              at,
              r: nodeRadius(node.importance, layout),
              atRest: labeledAtRest(node, layout),
            },
          ]
        : [];
    }),
    canvas,
  );

  const regions = model.clusters.map((cluster) => {
    const { center, rx, ry } = clusterShape(cluster, layout);
    return markup`<ellipse class="m-region m-cl-${cluster.id}" cx="${center.x}" cy="${center.y}" rx="${rx}" ry="${ry}"/><text class="m-region-label m-cl-${cluster.id}" x="${center.x}" y="${Math.round(center.y - ry + 16)}" text-anchor="middle">${clusterName(cluster.id, t)}</text>`;
  });

  const edges = model.edges.flatMap((edge) => {
    const a = positions.get(edge.source);
    const b = positions.get(edge.target);
    if (!a || !b) return [];
    return [
      markup`<path class="m-edge${edge.bridge ? ' is-bridge' : ''}" data-edge="${edgeKey(edge)}" d="${curvePath(a, b)}"/>`,
    ];
  });

  const groups = model.clusters.map((cluster) => {
    const nodes = model.nodes
      .filter((node) => node.cluster === cluster.id)
      .flatMap((node) => {
        const at = positions.get(node.id);
        return at ? [renderNode(node, at, labels.get(node.id), layout, t)] : [];
      });
    return markup`<g role="group" aria-label="${clusterName(cluster.id, t)}">${nodes}</g>`;
  });

  return markup`<svg class="m-svg m-svg-${layout}" viewBox="0 0 ${canvas.width} ${canvas.height}" role="group" aria-label="${t.commands.map.label}"><g class="m-regions" aria-hidden="true">${regions}</g><g class="m-edges" aria-hidden="true">${edges}</g>${groups}</svg>`;
}

function renderLegend(model: MapModel, t: Strings): Html {
  const strings = t.commands.map;
  const byType = countBy(model.nodes, 'type');
  const byCluster = countBy(model.nodes, 'cluster');
  const types = TYPE_ORDER.filter((type) => byType.has(type)).map(
    (type) =>
      markup`<button type="button" class="m-filter" data-filter="types" data-value="${type}" aria-pressed="false" disabled>${swatch(type)}<span>${t.card.types[type]}</span> <span class="m-count">${byType.get(type) ?? 0}</span></button>`,
  );
  const topics = model.clusters.map(
    (cluster) =>
      markup`<button type="button" class="m-filter m-cl-${cluster.id}" data-filter="clusters" data-value="${cluster.id}" aria-pressed="false" disabled><span class="m-color" aria-hidden="true"></span><span>${clusterName(cluster.id, t)}</span> <span class="m-count">${byCluster.get(cluster.id) ?? 0}</span></button>`,
  );
  return markup`<div class="m-legend"><div class="m-filters" role="group" aria-label="${strings.filterTypes}"><span class="m-legend-title" aria-hidden="true">${strings.types}</span>${types}</div><div class="m-filters" role="group" aria-label="${strings.filterTopics}"><span class="m-legend-title" aria-hidden="true">${strings.topics}</span>${topics}</div><div class="m-panel" data-map-panel aria-live="off">${renderPanel(null, [], t)}</div></div>`;
}

/**
 * The connections panel: the focused node, its related items (links that
 * open their card) and an "open card" link. With nothing focused, a hint.
 */
export function renderPanel(
  node: MapNode | null,
  related: readonly MapNode[],
  t: Strings,
): Html {
  const strings = t.commands.map;
  if (!node)
    return markup`<p class="c-dim c-small m-panel-idle">${strings.panelIdle}</p>`;
  const items = related.length
    ? markup`<ul class="m-related">${related.map(
        (other) =>
          markup`<li class="m-cl-${other.cluster}">${swatch(other.type)}<a class="c-link" href="${other.path}" data-card-open="${other.id}">${other.title}</a></li>`,
      )}</ul>`
    : markup`<p class="c-dim c-small">${strings.noConnections}</p>`;
  return markup`<p class="m-panel-title c-small"><span class="c-dim">${strings.connections} ·</span> <span class="c-title">${node.title}</span> <a class="c-link m-panel-open" href="${node.path}" data-card-open="${node.id}">${strings.openCard}</a></p>${items}`;
}

/** Text alternative: the same items, grouped by topic, as plain links. */
function renderList(model: MapModel, t: Strings): Html {
  const groups = model.clusters.map((cluster) => {
    const nodes = model.nodes.filter((node) => node.cluster === cluster.id);
    const rows = nodes.map(
      (node) =>
        markup`<li>${swatch(node.type)}<a class="c-link" href="${node.path}" data-card-open="${node.id}">${node.title}</a> <span class="c-dim c-small">${t.card.types[node.type]}${node.dates ? ` · ${node.dates}` : ''}</span></li>`,
    );
    return markup`<div class="m-list-group m-cl-${cluster.id}"><p class="m-list-title">${clusterName(cluster.id, t)}</p><ul aria-label="${clusterName(cluster.id, t)}">${rows}</ul></div>`;
  });
  return markup`<details class="m-list"><summary class="c-small">${t.commands.map.list}</summary><div class="m-list-groups">${groups}</div></details>`;
}

/** The whole `map` output. */
export function renderMap(model: MapModel, t: Strings): Html {
  const strings = t.commands.map;
  if (model.nodes.length === 0) {
    return markup`<p class="c-dim">${strings.empty}${commandButton('ls')}</p>`;
  }
  return markup`<div class="m-map" data-map><p class="c-dim c-small m-hint"><span class="m-hint-wide">${strings.hint}</span><span class="m-hint-narrow">${strings.hintTouch}</span></p><div class="m-layout"><div class="m-canvas">${renderSvg(model, 'desktop', t)}${renderSvg(model, 'mobile', t)}</div>${renderLegend(model, t)}</div>${renderList(model, t)}</div>`;
}
