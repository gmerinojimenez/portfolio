/**
 * Builds `map.json`: cluster assignment, stable layout and edges.
 * Pure functions, no I/O (docs/specs/06-embeddings-map.md).
 */
import { createHash } from 'node:crypto';
import { cosine } from './embeddings';
import {
  PROJECTION_SEED,
  SIMILARITY_K,
  clusterDefs,
  clusterIds,
  clusterKeywords,
  defaultCluster,
  type ClusterId,
} from './map-config';

export interface MapItem {
  id: string;
  type: string;
  topic?: string | undefined;
  tags: string[];
  app?: string | undefined;
  related: string[];
  importance: number;
}

export interface MapNode {
  id: string;
  type: string;
  cluster: ClusterId;
  importance: number;
  x: number;
  y: number;
  local: { x: number; y: number };
  app?: string;
}

export type EdgeReason = 'related' | 'app' | 'similarity';

export interface MapEdge {
  source: string;
  target: string;
  weight: number;
  reasons: EdgeReason[];
  bridge: boolean;
}

export interface MapData {
  version: 1;
  embeddings: { provider: string; model: string; dimensions: number };
  similarity: { k: number; threshold: number };
  clusters: {
    id: ClusterId;
    label: string;
    center: { x: number; y: number };
    radius: number;
    count: number;
  }[];
  nodes: MapNode[];
  edges: MapEdge[];
}

// ---------------------------------------------------------------- clusters

const isCluster = (value: string): value is ClusterId =>
  (clusterIds as readonly string[]).includes(value);

function clusterFromWords(words: string[]): ClusterId | undefined {
  const score = new Map<ClusterId, number>();
  for (const word of words.map((w) => w.toLowerCase())) {
    for (const id of clusterIds) {
      if (clusterKeywords[id].includes(word)) {
        score.set(id, (score.get(id) ?? 0) + 1);
      }
    }
  }
  let best: ClusterId | undefined;
  for (const id of clusterIds) {
    // Strictly greater: ties go to the first cluster in `clusterIds` order.
    if ((score.get(id) ?? 0) > (score.get(best as ClusterId) ?? 0)) best = id;
  }
  return best;
}

/**
 * Topic -> cluster. Order: explicit `topic` (cluster id or keyword), then
 * tags, then the cluster of the app the item belongs to, then the default.
 */
export function inferCluster(
  item: MapItem,
  byId: ReadonlyMap<string, MapItem>,
  seen: ReadonlySet<string> = new Set(),
): ClusterId {
  if (item.topic) {
    const topic = item.topic.toLowerCase();
    if (isCluster(topic)) return topic;
    const fromTopic = clusterFromWords([topic]);
    if (fromTopic) return fromTopic;
  }
  const fromTags = clusterFromWords(item.tags);
  if (fromTags) return fromTags;
  const app = item.app ? byId.get(item.app) : undefined;
  if (app && !seen.has(app.id)) {
    return inferCluster(app, byId, new Set([...seen, item.id]));
  }
  return defaultCluster;
}

// ------------------------------------------------------------------ layout

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const projections = new Map<number, [number[], number[]]>();

/** Two seeded Gaussian directions of length `dimensions` (cached). */
function projectionFor(dimensions: number): [number[], number[]] {
  const cached = projections.get(dimensions);
  if (cached) return cached;
  const seed = createHash('sha256')
    .update(PROJECTION_SEED)
    .digest()
    .readUInt32BE(0);
  const random = mulberry32(seed);
  const gaussian = () => {
    const u = Math.max(random(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    xs.push(gaussian());
    ys.push(gaussian());
  }
  const result: [number[], number[]] = [xs, ys];
  projections.set(dimensions, result);
  return result;
}

const SPREAD = 2.5; // raw projection std is ~1 for unit vectors
const FILL = 0.85; // fraction of the cluster disc used by projected points
const MIN_DISTANCE = 0.3; // minimum gap between nodes, in disc units
const MAX_RADIUS = 0.9;
const RELAX_ITERATIONS = 60;

/** Vector -> point inside the unit disc. Depends only on the vector. */
export function projectToDisc(vector: number[]): { x: number; y: number } {
  const [xs, ys] = projectionFor(vector.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < vector.length; i++) {
    x += (vector[i] ?? 0) * (xs[i] ?? 0);
    y += (vector[i] ?? 0) * (ys[i] ?? 0);
  }
  x /= SPREAD;
  y /= SPREAD;
  const length = Math.hypot(x, y);
  const scale = length > 1 ? 1 / length : 1;
  return { x: x * scale * FILL, y: y * scale * FILL };
}

/**
 * Pushes overlapping points apart (deterministic: sorted by id, fixed number
 * of passes) and keeps them inside the disc.
 */
export function separate(points: { id: string; x: number; y: number }[]): void {
  points.sort((a, b) => a.id.localeCompare(b.id));
  for (let pass = 0; pass < RELAX_ITERATIONS; pass++) {
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!;
        const b = points[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= MIN_DISTANCE) continue;
        if (d < 1e-9) {
          const angle = (2 * Math.PI * (j + 1)) / (points.length + 1);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const push =
          (MIN_DISTANCE - Math.hypot(b.x - a.x, b.y - a.y)) / 2 + 1e-4;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
      const r = Math.hypot(points[i]!.x, points[i]!.y);
      if (r > MAX_RADIUS) {
        points[i]!.x *= MAX_RADIUS / r;
        points[i]!.y *= MAX_RADIUS / r;
      }
    }
    if (!moved) break;
  }
}

// ------------------------------------------------------------------- edges

const pairKey = (a: string, b: string) =>
  a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

/**
 * Explicit relations (`related`, `app`) plus the `k` most similar neighbours
 * of every node above `threshold`. Undirected, no duplicates.
 */
export function buildEdges(
  items: MapItem[],
  vectors: ReadonlyMap<string, number[]>,
  clusterOf: ReadonlyMap<string, ClusterId>,
  k: number,
  threshold: number,
): MapEdge[] {
  const ids = new Set(items.map((i) => i.id));
  const reasons = new Map<string, Set<EdgeReason>>();
  const add = (a: string, b: string, reason: EdgeReason) => {
    if (a === b || !ids.has(a) || !ids.has(b)) return;
    const key = pairKey(a, b);
    const set = reasons.get(key) ?? new Set<EdgeReason>();
    set.add(reason);
    reasons.set(key, set);
  };

  for (const item of items) {
    for (const target of item.related) add(item.id, target, 'related');
    if (item.app) add(item.id, item.app, 'app');
  }

  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  for (const item of sorted) {
    const a = vectors.get(item.id);
    if (!a) continue;
    const neighbours = sorted
      .filter((o) => o.id !== item.id && vectors.has(o.id))
      .map((o) => ({ id: o.id, sim: cosine(a, vectors.get(o.id)!) }))
      .filter((n) => n.sim >= threshold)
      .sort((x, y) => y.sim - x.sim || x.id.localeCompare(y.id))
      .slice(0, k);
    for (const n of neighbours) add(item.id, n.id, 'similarity');
  }

  const order: EdgeReason[] = ['related', 'app', 'similarity'];
  return [...reasons]
    .map(([key, set]) => {
      const [source, target] = key.split('\u0000') as [string, string];
      const va = vectors.get(source);
      const vb = vectors.get(target);
      return {
        source,
        target,
        weight: va && vb ? round(cosine(va, vb), 4) : 0,
        reasons: order.filter((r) => set.has(r)),
        bridge: clusterOf.get(source) !== clusterOf.get(target),
      };
    })
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
    );
}

// ------------------------------------------------------------------ build

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

export interface BuildMapInput {
  items: MapItem[];
  vectors: ReadonlyMap<string, number[]>;
  embeddings: MapData['embeddings'];
  k?: number;
  threshold: number;
}

export function buildMap(input: BuildMapInput): MapData {
  const k = input.k ?? SIMILARITY_K;
  const items = [...input.items].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  const clusterOf = new Map<string, ClusterId>(
    items.map((i) => [i.id, inferCluster(i, byId)]),
  );

  const nodes: MapNode[] = [];
  for (const def of clusterDefs) {
    const members = items.filter((i) => clusterOf.get(i.id) === def.id);
    const points = members.map((item) => {
      const vector = input.vectors.get(item.id);
      if (!vector) throw new Error(`No vector for "${item.id}"`);
      return { id: item.id, ...projectToDisc(vector) };
    });
    separate(points);
    for (const point of points) {
      const item = byId.get(point.id)!;
      const local = { x: round(point.x, 4), y: round(point.y, 4) };
      const node: MapNode = {
        id: item.id,
        type: item.type,
        cluster: def.id,
        importance: item.importance,
        x: round(def.center.x + local.x * def.radius, 4),
        y: round(def.center.y + local.y * def.radius, 4),
        local,
      };
      if (item.app && byId.has(item.app)) node.app = item.app;
      nodes.push(node);
    }
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: 1,
    embeddings: input.embeddings,
    similarity: { k, threshold: input.threshold },
    clusters: clusterDefs.map((def) => ({
      id: def.id,
      label: def.label,
      center: def.center,
      radius: def.radius,
      count: nodes.filter((n) => n.cluster === def.id).length,
    })),
    nodes,
    edges: buildEdges(items, input.vectors, clusterOf, k, input.threshold),
  };
}

export function serializeMap(map: MapData): string {
  return JSON.stringify(map, null, 2) + '\n';
}
