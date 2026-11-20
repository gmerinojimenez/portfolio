/**
 * What the map shows at a given moment: legend filters and the connections
 * of the focused node. Pure functions; `enhance.ts` applies the results to
 * the DOM.
 */
import type { ItemType } from '../../lib/content-schema';
import type { ClusterId, MapEdge, MapModel, MapNode } from './model';

/** Legend filters. An empty set means "no filter" for that dimension. */
export interface MapFilter {
  readonly types: ReadonlySet<ItemType>;
  readonly clusters: ReadonlySet<ClusterId>;
  /**
   * Items that use the technology chosen with `stack <tech>` (S15); `null`
   * when no technology is chosen.
   */
  readonly items?: ReadonlySet<string> | null;
}

export const NO_FILTER: MapFilter = {
  types: new Set(),
  clusters: new Set(),
  items: null,
};

/**
 * Event the `stack` command dispatches on a map (`[data-map]`) to show only
 * the items of a technology. `detail.items` is `null` to clear it.
 */
export const TECH_FILTER_EVENT = 'map:tech-filter';

export interface TechFilterDetail {
  readonly items: readonly string[] | null;
}

export function isFiltering(filter: MapFilter): boolean {
  return (
    filter.types.size > 0 ||
    filter.clusters.size > 0 ||
    (filter.items ?? null) !== null
  );
}

/** The same filter, limited to `items` (or no longer limited, with `null`). */
export function withItems(
  filter: MapFilter,
  items: readonly string[] | null,
): MapFilter {
  return { ...filter, items: items ? new Set(items) : null };
}

/** A node shows when it matches both dimensions. */
export function matchesFilter(
  node: Pick<MapNode, 'type' | 'cluster'>,
  filter: MapFilter,
): boolean {
  return (
    (filter.types.size === 0 || filter.types.has(node.type)) &&
    (filter.clusters.size === 0 || filter.clusters.has(node.cluster))
  );
}

/** Pressing a legend entry adds it to its filter, pressing it again removes it. */
export function toggleFilter(
  filter: MapFilter,
  dimension: 'types' | 'clusters',
  value: string,
): MapFilter {
  const next = new Set<string>(filter[dimension]);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return dimension === 'types'
    ? { ...filter, types: next as Set<ItemType> }
    : { ...filter, clusters: next as Set<ClusterId> };
}

/** Ids of the nodes that pass the filter. */
export function visibleIds(
  nodes: readonly MapNode[],
  filter: MapFilter,
): Set<string> {
  const items = filter.items ?? null;
  return new Set(
    nodes
      .filter((node) => matchesFilter(node, filter))
      .filter((node) => items === null || items.has(node.id))
      .map((node) => node.id),
  );
}

/** Ids connected to `id`, in edge order, without duplicates. */
export function neighborsOf(edges: readonly MapEdge[], id: string): string[] {
  const out = new Set<string>();
  for (const edge of edges) {
    if (edge.source === id) out.add(edge.target);
    else if (edge.target === id) out.add(edge.source);
  }
  return [...out];
}

export const edgeKey = (edge: Pick<MapEdge, 'source' | 'target'>) =>
  `${edge.source}|${edge.target}`;

/**
 * `related` connections to draw (ADR 0006): none at rest; with a focused
 * node, its own. Edges touching a filtered-out node never show. Tree
 * branches are always drawn.
 */
export function shownEdges(
  edges: readonly MapEdge[],
  focused: string | null,
  visible: ReadonlySet<string>,
): Set<string> {
  if (focused === null) return new Set();
  return new Set(
    edges
      .filter((e) => visible.has(e.source) && visible.has(e.target))
      .filter((e) => e.source === focused || e.target === focused)
      .map(edgeKey),
  );
}

/**
 * The focused node's place in the tree: itself, the path down to the trunk
 * (items, groups, stage) and its direct children. Branches leading to these
 * nodes stay lit.
 */
export function pathSet(
  model: Pick<MapModel, 'tree'>,
  id: string,
): Set<string> {
  const node = model.tree.get(id);
  if (!node) return new Set();
  const out = new Set([id, ...node.children]);
  for (let p = node.parent; p !== null; p = model.tree.get(p)?.parent ?? null) {
    if (out.has(p)) break;
    out.add(p);
  }
  return out;
}

/** Items connected to `id`: parent item, children and `related`, deduplicated. */
export function connectionsOf(
  model: Pick<MapModel, 'tree' | 'edges'>,
  id: string,
): string[] {
  const node = model.tree.get(id);
  if (!node) return [];
  const isItem = (other: string) => model.tree.get(other)?.kind === 'item';
  return [
    ...new Set([
      ...(node.parent && isItem(node.parent) ? [node.parent] : []),
      ...node.children.filter(isItem),
      ...neighborsOf(model.edges, id),
    ]),
  ];
}
