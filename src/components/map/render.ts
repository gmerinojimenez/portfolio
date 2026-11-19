/**
 * The career tree as HTML + inline SVG. A pure template (S03's `markup`), so
 * it runs at build time for the boot output and in the browser for a typed
 * `map`, and the result is the same. Everything works without JavaScript:
 * nodes are real links, the growth animation is CSS, and the list
 * alternative is a native `<details>`.
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
  curvePath,
  LABEL_FONT_SIZE,
  labelText,
  placeLabels,
  ROOT_LABEL_CHARS,
  textBox,
  type Box,
  type PlacedLabel,
} from './geometry';
import { edgeKey } from './filters';
import { layoutTree, type PlacedNode, type TreeLayout } from './layout';
import {
  countBy,
  labeledAtRest,
  ROOTS_SECTION,
  TYPE_ORDER,
  usedClusters,
  type ClusterId,
  type Layout,
  type MapModel,
  type MapNode,
  type MapSection,
  type TreeNode,
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

/** "Etapa 2: Tuenti, 2015 – 2023" */
export function sectionName(section: MapSection, t: Strings): string {
  const strings = t.commands.map;
  const name =
    section.kind === 'stage'
      ? `${strings.stage} ${section.ordinal ?? ''}: ${section.title}`
      : section.title;
  return section.period ? `${name}, ${section.period}` : name;
}

/**
 * A node's marks, centered on 0,0 (shapes from the prototype): a filled
 * circle for projects, apps add a light core, libraries an outer ring,
 * posts are hollow. Main nodes are a monogram badge instead.
 */
function nodeMarks(type: ItemType, r: number, badge?: string): Html {
  if (badge) {
    return markup`<circle class="m-shape m-badge" r="${r}"/><text class="m-mono" y="3" text-anchor="middle">${badge}</text>`;
  }
  const core = Math.round(r * 3.8) / 10;
  switch (type) {
    case 'post':
      return markup`<circle class="m-shape m-hollow" r="${r}"/>`;
    case 'oss':
      return markup`<circle class="m-shape" r="${r}"/><circle class="m-mark m-outer" r="${Math.round((r + 2.6) * 10) / 10}"/>`;
    case 'app':
      return markup`<circle class="m-shape" r="${r}"/><circle class="m-mark m-core" r="${core}"/>`;
    default:
      return markup`<circle class="m-shape" r="${r}"/>`;
  }
}

/** Small shape icon for the legend, lists and the connections panel. */
export function swatch(type: ItemType): Html {
  return markup`<svg class="m-swatch" viewBox="-9 -9 18 18" aria-hidden="true" focusable="false">${nodeMarks(type, type === 'oss' ? 4.4 : 5.5)}</svg>`;
}

const delay = (seconds: number) => `--d:${seconds}s`;

/** Label text; roots get more characters for university names. */
const rootAware = (n: { title: string; section: string }) =>
  labelText(
    n.title,
    n.section === ROOTS_SECTION ? ROOT_LABEL_CHARS : undefined,
  );

function renderNode(
  node: MapNode,
  at: PlacedNode,
  label: PlacedLabel | undefined,
  layout: Layout,
  t: Strings,
  badge: string | undefined,
  glow: string,
): Html {
  const r = at.r;
  const hit = Math.max(r + 6, layout === 'mobile' ? 18 : 13);
  const classes = [
    'm-node',
    `m-cl-${node.cluster}`,
    badge ? 'm-main' : '',
    label?.atRest ? 'is-labeled' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const text = label
    ? markup`<text class="m-label" x="${label.dx}" y="${label.dy}" text-anchor="${label.anchor}" font-size="${LABEL_FONT_SIZE}" aria-hidden="true">${rootAware(node)}</text>`
    : '';
  return markup`<a class="${classes}" href="${node.path}" data-card-open="${node.id}" data-node="${node.id}" data-type="${node.type}" data-cluster="${node.cluster}" aria-label="${nodeName(node, t)}" transform="translate(${at.x} ${at.y})"><g class="m-body" style="${delay(at.delay)}"><circle class="m-hit" r="${hit}"/><circle class="m-halo" r="${r + 5}" filter="url(#${glow})"/><circle class="m-ring" r="${r + 4.5}"/>${nodeMarks(node.type, r, badge)}${text}</g></a>`;
}

/** A stage or the stem: a badge on the trunk with a two-line label. */
function renderAnchor(
  node: Pick<TreeNode, 'id' | 'kind' | 'cluster' | 'title'>,
  section: Pick<MapSection, 'ordinal' | 'period'> | undefined,
  at: Pick<PlacedNode, 'x' | 'y' | 'r' | 'delay'>,
  side: -1 | 1,
  glow: string,
  mark: string,
): Html {
  const isStem = node.kind === 'stem';
  const x = side * (at.r + 6);
  const anchor = side === 1 ? 'start' : 'end';
  const period = section?.period ?? '';
  return markup`<g class="m-anchor ${isStem ? 'm-stem' : `m-stage m-cl-${node.cluster}`}" data-anchor="${node.id}" transform="translate(${at.x} ${at.y})"><g class="m-body" style="${delay(at.delay)}"><circle class="m-halo" r="${at.r + 8}" filter="url(#${glow})"/><circle class="m-shape m-badge m-anchor-badge" r="${at.r}"/><text class="m-badge-text" y="4" text-anchor="middle">${mark}</text><text class="m-anchor-label" x="${x}" y="-1" text-anchor="${anchor}">${node.title}</text>${period ? markup`<text class="m-anchor-period" x="${x}" y="12" text-anchor="${anchor}">${period}</text>` : ''}</g></g>`;
}

/** Box of an anchor's two-line label, so item labels avoid it. */
function anchorBox(
  node: TreeNode,
  section: MapSection | undefined,
  at: PlacedNode,
  side: -1 | 1,
): Box {
  const chars = Math.max(node.title.length, (section?.period ?? '').length);
  const box = textBox(
    chars,
    at.x + side * (at.r + 6),
    at.y - 1,
    side === 1 ? 'start' : 'end',
  );
  return { ...box, y2: box.y2 + 13 };
}

/** One SVG per layout; CSS shows the one that fits the screen. */
export function renderSvg(model: MapModel, layout: Layout, t: Strings): Html {
  const L: TreeLayout = layoutTree(model, layout);
  const canvas = CANVAS[layout];
  const strings = t.commands.map;
  const at = (id: string) => L.nodes.get(id)!;
  const sectionOf = new Map(model.sections.map((s) => [s.id, s]));
  const anchors = [...model.tree.values()].filter(
    (n) => n.kind === 'stage' || n.kind === 'stem',
  );
  const groups = [...model.tree.values()].filter((n) => n.kind === 'group');

  // The stem's label goes right unless it would leave the canvas.
  const anchorSide = (n: TreeNode): -1 | 1 => {
    if (n.kind === 'stage') return L.stageLabelSide.get(n.id) ?? 1;
    const p = at(n.id);
    const chars = Math.max(
      n.title.length,
      sectionOf.get('stem')?.period.length ?? 0,
    );
    return p.x + p.r + 6 + chars * LABEL_FONT_SIZE * 0.6 <= canvas.width - 4
      ? 1
      : -1;
  };
  const sectionFor = (n: TreeNode) =>
    sectionOf.get(n.kind === 'stem' ? 'stem' : n.id);
  const obstacles = anchors.map((n) =>
    anchorBox(n, sectionFor(n), at(n.id), anchorSide(n)),
  );

  const labels = placeLabels(
    [
      ...groups.map((g) => ({
        id: g.id,
        text: rootAware(g),
        at: at(g.id),
        r: at(g.id).r,
        atRest: true,
        side: at(g.id).side,
      })),
      ...model.nodes.map((node) => ({
        id: node.id,
        text: rootAware(node),
        at: at(node.id),
        r: at(node.id).r,
        // Degrees and other top-level roots too: there are only a few.
        atRest:
          labeledAtRest(node, layout) ||
          (layout === 'desktop' &&
            node.section === 'roots' &&
            model.tree.get(node.id)?.parent === null &&
            node.type === 'education'),
        side: at(node.id).side,
      })),
    ],
    canvas,
    obstacles,
  );

  const id = `m-trunk-${layout}`;
  const glow = `m-glow-${layout}`;
  const trunk = L.trunk;
  const gradient = trunk
    ? markup`<linearGradient id="${id}" class="m-trunk-grad" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${trunk.y1}" y2="${trunk.y2}">${trunk.stops.map((s) => markup`<stop class="m-cl-${s.cluster}" offset="${s.offset}"/>`)}</linearGradient>`
    : '';
  const defs = markup`<defs><filter id="${glow}" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>${gradient}</defs>`;
  const years = L.years.map(
    (y) => markup`<text class="m-year" x="4" y="${y.y + 3}">${y.label}</text>`,
  );
  const hasRoots = sectionOf.has('roots');
  const ground = hasRoots
    ? markup`<line class="m-ground" x1="0" x2="${canvas.width}" y1="${L.groundY + 4}" y2="${L.groundY + 4}"/><text class="m-year" x="${canvas.width - 6}" y="${L.groundY + 18}" text-anchor="end">${strings.rootsLine}</text>`
    : '';
  // The roots meet the trunk at an education badge.
  const rootsSection = sectionOf.get('roots');
  const rootsAnchor = rootsSection
    ? renderAnchor(
        {
          id: 'roots',
          kind: 'stage',
          cluster: 'fundamentals',
          title: rootsSection.title,
        },
        {
          period: strings.rootsCount.replace(
            '{n}',
            String(rootsSection.items.length),
          ),
        },
        { ...L.ground, r: layout === 'mobile' ? 12 : 13, delay: L.groundDelay },
        -1,
        glow,
        strings.rootsBadge,
      )
    : '';
  const draw = (s: { delay: number; duration: number; length: number }) =>
    `--d:${s.delay}s;--dur:${s.duration}s;--len:${s.length}`;
  const trunkEls = trunk
    ? markup`<path class="m-trunk m-trunk-glow" d="${trunk.d}" stroke="url(#${id})" style="${draw(trunk)}"/><path class="m-trunk" d="${trunk.d}" stroke="url(#${id})" style="${draw(trunk)}"/>`
    : '';
  const strokes = L.strokes.map(
    (s) =>
      markup`<path class="m-stroke m-k-${s.kind} m-cl-${s.cluster}" data-branch="${s.id}" d="${s.d}" style="${draw(s)}"/>`,
  );
  const related = model.edges.flatMap((edge) => {
    const a = L.nodes.get(edge.source);
    const b = L.nodes.get(edge.target);
    return a && b
      ? [
          markup`<path class="m-edge" data-edge="${edgeKey(edge)}" d="${curvePath(a, b, 0.25)}"/>`,
        ]
      : [];
  });

  const anchorEls = anchors.map((n) =>
    renderAnchor(
      n,
      sectionFor(n),
      at(n.id),
      anchorSide(n),
      glow,
      n.kind === 'stem'
        ? '+'
        : strings.ordinal.replace('{n}', String(sectionFor(n)?.ordinal ?? '')),
    ),
  );
  const groupEls = groups.map((g) => {
    const p = at(g.id);
    const label = labels.get(g.id);
    const text = label
      ? markup`<text class="m-label" x="${label.dx}" y="${label.dy}" text-anchor="${label.anchor}" font-size="${LABEL_FONT_SIZE}">${rootAware(g)}</text>`
      : '';
    return markup`<g class="m-anchor m-group m-cl-${g.cluster}${label?.atRest ? ' is-labeled' : ''}" data-anchor="${g.id}" transform="translate(${p.x} ${p.y})"><g class="m-body" style="${delay(p.delay)}"><circle class="m-halo" r="${p.r + 5}" filter="url(#${glow})"/>${nodeMarks('project', p.r, g.badge ?? '')}${text}</g></g>`;
  });

  const sections = model.sections.map((section) => {
    const nodes = model.nodes
      .filter((n) => n.section === section.id)
      .map((n) =>
        renderNode(
          n,
          at(n.id),
          labels.get(n.id),
          layout,
          t,
          model.tree.get(n.id)?.badge,
          glow,
        ),
      );
    return markup`<g role="group" aria-label="${sectionName(section, t)}">${nodes}</g>`;
  });

  return markup`<svg class="m-svg m-svg-${layout}" viewBox="0 0 ${canvas.width} ${canvas.height}" role="group" aria-label="${strings.label}">${defs}<g class="m-scenery" aria-hidden="true">${years}${ground}${trunkEls}${strokes}${related}${rootsAnchor}${anchorEls}${groupEls}</g>${sections}</svg>`;
}

function renderLegend(model: MapModel, t: Strings): Html {
  const strings = t.commands.map;
  const byType = countBy(model.nodes, 'type');
  const byCluster = countBy(model.nodes, 'cluster');
  const types = TYPE_ORDER.filter((type) => byType.has(type)).map(
    (type) =>
      markup`<button type="button" class="m-filter" data-filter="types" data-value="${type}" aria-pressed="false" disabled>${swatch(type)}<span>${t.card.types[type]}</span> <span class="m-count">${byType.get(type) ?? 0}</span></button>`,
  );
  const topics = usedClusters(model.nodes).map(
    (cluster) =>
      markup`<button type="button" class="m-filter m-cl-${cluster}" data-filter="clusters" data-value="${cluster}" aria-pressed="false" disabled><span class="m-color" aria-hidden="true"></span><span>${clusterName(cluster, t)}</span> <span class="m-count">${byCluster.get(cluster) ?? 0}</span></button>`,
  );
  return markup`<div class="m-legend"><button type="button" class="m-filter m-replay" data-map-replay aria-label="${strings.replayLabel}" disabled><span aria-hidden="true">↻</span> ${strings.replay}</button><div class="m-filters" role="group" aria-label="${strings.filterTypes}"><span class="m-legend-title" aria-hidden="true">${strings.types}</span>${types}</div><div class="m-filters" role="group" aria-label="${strings.filterTopics}"><span class="m-legend-title" aria-hidden="true">${strings.topics}</span>${topics}</div><div class="m-panel" data-map-panel aria-live="off">${renderPanel(null, [], t)}</div></div>`;
}

/**
 * The connections panel: the focused node, its connections (links that
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

/** Text alternative: the same items, by stage (newest first), as plain links. */
function renderList(model: MapModel, t: Strings): Html {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const groups = model.sections.map((section) => {
    const rows = section.items.flatMap((id) => {
      const node = byId.get(id);
      return node
        ? [
            markup`<li class="m-cl-${node.cluster}">${swatch(node.type)}<a class="c-link" href="${node.path}" data-card-open="${node.id}">${node.title}</a> <span class="c-dim c-small">${t.card.types[node.type]}${node.dates ? ` · ${node.dates}` : ''}</span></li>`,
          ]
        : [];
    });
    const kind =
      section.kind === 'stage'
        ? `m-cl-${section.cluster}`
        : `m-list-${section.kind}`;
    return markup`<div class="m-list-group ${kind}"><p class="m-list-title">${section.title}${section.period ? markup` <span class="c-dim">${section.period}</span>` : ''}</p><ul aria-label="${sectionName(section, t)}">${rows}</ul></div>`;
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
