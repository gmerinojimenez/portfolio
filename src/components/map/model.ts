/**
 * The semantic map's data: `src/data/map.json` (positions and edges, made at
 * build time by S06) joined with the console's items (titles, paths, dates).
 * Pure functions only, so Vitest can test them and the browser can reuse them.
 */
import type { ItemType } from '../../lib/content-schema';
import type { CardItem } from '../card/model';

/** A point in the unit square (`y` grows downwards). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** `src/data/map.json`, as written by `scripts/embed.ts` (S06). */
export interface MapData {
  readonly clusters: readonly {
    readonly id: string;
    readonly label: string;
    readonly center: Point;
    readonly radius: number;
    readonly count: number;
  }[];
  readonly nodes: readonly {
    readonly id: string;
    readonly type: string;
    readonly cluster: string;
    readonly importance: number;
    readonly x: number;
    readonly y: number;
    readonly local: Point;
    readonly app?: string;
  }[];
  readonly edges: readonly {
    readonly source: string;
    readonly target: string;
    readonly weight: number;
    readonly reasons: readonly string[];
    readonly bridge: boolean;
  }[];
}

/** Clusters in display and tab order (ui-direction.md). */
export const CLUSTER_ORDER = [
  'android',
  'cloud',
  'ai',
  'fundamentals',
] as const;
export type ClusterId = (typeof CLUSTER_ORDER)[number];

/** Types in legend order. */
export const TYPE_ORDER: readonly ItemType[] = [
  'app',
  'project',
  'oss',
  'post',
  'education',
];

export interface MapCluster {
  readonly id: ClusterId;
  /** Desktop center and radius, in the unit square. */
  readonly center: Point;
  readonly radius: number;
}

export interface MapNode {
  readonly id: string;
  readonly type: ItemType;
  readonly cluster: ClusterId;
  /** 1–5: node size and whether its label shows at rest. */
  readonly importance: number;
  readonly title: string;
  readonly dates: string;
  readonly path: string;
  /** Desktop position in the unit square. */
  readonly desktop: Point;
  /** Offset inside the cluster, in the unit disc (mobile layout). */
  readonly local: Point;
}

export interface MapEdge {
  readonly source: string;
  readonly target: string;
  /** Joins two clusters: the only edges shown at rest. */
  readonly bridge: boolean;
}

export interface MapModel {
  /** Only clusters with at least one visible node, in `CLUSTER_ORDER`. */
  readonly clusters: readonly MapCluster[];
  /** Visible nodes in tab order (by cluster, then top to bottom). */
  readonly nodes: readonly MapNode[];
  /** Edges whose two ends are visible. */
  readonly edges: readonly MapEdge[];
}

const isCluster = (id: string): id is ClusterId =>
  (CLUSTER_ORDER as readonly string[]).includes(id);

/**
 * Joins the map with the items the visitor can see. A node without an item
 * (a draft in production, or a stale `map.json`) is skipped together with
 * its edges, and a cluster left empty isn't drawn.
 */
export function buildMapModel(
  data: MapData,
  items: readonly Pick<CardItem, 'id' | 'type' | 'title' | 'dates' | 'path'>[],
): MapModel {
  const byId = new Map(items.map((item) => [item.id, item]));
  const nodes: MapNode[] = [];
  for (const node of data.nodes) {
    const item = byId.get(node.id);
    if (!item || !isCluster(node.cluster)) continue;
    nodes.push({
      id: node.id,
      type: item.type,
      cluster: node.cluster,
      importance: node.importance,
      title: item.title,
      dates: item.dates,
      path: item.path,
      desktop: { x: node.x, y: node.y },
      local: node.local,
    });
  }
  const visible = new Set(nodes.map((n) => n.id));
  const used = new Set(nodes.map((n) => n.cluster));
  const clusters = CLUSTER_ORDER.filter((id) => used.has(id)).flatMap((id) => {
    const cluster = data.clusters.find((c) => c.id === id);
    return cluster
      ? [{ id, center: cluster.center, radius: cluster.radius }]
      : [];
  });
  const edges = data.edges
    .filter((e) => visible.has(e.source) && visible.has(e.target))
    .map(({ source, target, bridge }) => ({ source, target, bridge }));
  return { clusters, nodes: tabOrder(nodes), edges };
}

/** By cluster (`CLUSTER_ORDER`), then top to bottom, then left to right. */
export function tabOrder<T extends Pick<MapNode, 'cluster' | 'desktop' | 'id'>>(
  nodes: readonly T[],
): T[] {
  const rank = (c: ClusterId) => CLUSTER_ORDER.indexOf(c);
  return [...nodes].sort(
    (a, b) =>
      rank(a.cluster) - rank(b.cluster) ||
      a.desktop.y - b.desktop.y ||
      a.desktop.x - b.desktop.x ||
      a.id.localeCompare(b.id),
  );
}

export type Layout = 'desktop' | 'mobile';

/**
 * Whether a node keeps its label visible at rest: apps and owned projects
 * (importance ≥ 4) on desktop, only the most important ones on mobile.
 */
export function labeledAtRest(
  node: Pick<MapNode, 'type' | 'importance'>,
  layout: Layout,
): boolean {
  if (layout === 'mobile') return node.importance >= 5;
  return node.type === 'app' || node.importance >= 4;
}

/** How many nodes there are of each value of `key` (for legend counts). */
export function countBy<K extends 'type' | 'cluster'>(
  nodes: readonly MapNode[],
  key: K,
): Map<MapNode[K], number> {
  const counts = new Map<MapNode[K], number>();
  for (const node of nodes) {
    counts.set(node[key], (counts.get(node[key]) ?? 0) + 1);
  }
  return counts;
}
