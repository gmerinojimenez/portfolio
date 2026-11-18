import { describe, expect, it } from 'vitest';
import { createFakeProvider } from './embeddings';
import { buildMap, inferCluster, projectToDisc, type MapItem } from './map';

const item = (over: Partial<MapItem> & { id: string }): MapItem => ({
  type: 'project',
  tags: [],
  related: [],
  importance: 3,
  ...over,
});

async function vectorsFor(items: MapItem[], texts: Record<string, string>) {
  const fake = createFakeProvider();
  const list = await fake.embed(
    items.map((i) => texts[i.id] ?? i.id),
    'document',
  );
  return new Map(items.map((i, n) => [i.id, list[n]!]));
}

const embeddings = { provider: 'fake', model: 'm', dimensions: 256 };

describe('inferCluster', () => {
  const byId = (items: MapItem[]) => new Map(items.map((i) => [i.id, i]));

  it('uses an explicit cluster topic', () => {
    const a = item({ id: 'a', topic: 'cloud', tags: ['android'] });
    expect(inferCluster(a, byId([a]))).toBe('cloud');
  });

  it('maps topic aliases such as kotlin to a cluster', () => {
    const a = item({ id: 'a', topic: 'kotlin' });
    expect(inferCluster(a, byId([a]))).toBe('android');
  });

  it('infers the topic from tags by majority', () => {
    const a = item({ id: 'a', tags: ['llm', 'evals', 'kotlin'] });
    expect(inferCluster(a, byId([a]))).toBe('ai');
  });

  it('inherits the cluster of its app when tags say nothing', () => {
    const app = item({ id: 'app', topic: 'cloud' });
    const p = item({ id: 'p', app: 'app', tags: ['misc'] });
    expect(inferCluster(p, byId([app, p]))).toBe('cloud');
  });

  it('falls back to fundamentals', () => {
    const a = item({ id: 'a', tags: ['unknown'] });
    expect(inferCluster(a, byId([a]))).toBe('fundamentals');
  });

  it('does not loop on cyclic app references', () => {
    const a = item({ id: 'a', app: 'b' });
    const b = item({ id: 'b', app: 'a' });
    expect(inferCluster(a, byId([a, b]))).toBe('fundamentals');
  });
});

describe('layout', () => {
  const items = [
    item({ id: 'a', topic: 'android' }),
    item({ id: 'b', topic: 'android' }),
    item({ id: 'c', topic: 'ai' }),
  ];
  const texts = {
    a: 'android compose kotlin app',
    b: 'android room offline sync',
    c: 'llm evaluaciones modelos',
  };

  it('is identical for identical input', async () => {
    const vectors = await vectorsFor(items, texts);
    const one = buildMap({ items, vectors, embeddings, threshold: 0.3 });
    const two = buildMap({
      items: [...items].reverse(),
      vectors,
      embeddings,
      threshold: 0.3,
    });
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });

  it('keeps nodes inside their cluster disc, around the fixed center', async () => {
    const vectors = await vectorsFor(items, texts);
    const map = buildMap({ items, vectors, embeddings, threshold: 0.3 });
    for (const node of map.nodes) {
      const def = map.clusters.find((c) => c.id === node.cluster)!;
      expect(Math.hypot(node.local.x, node.local.y)).toBeLessThanOrEqual(1);
      expect(node.x).toBeCloseTo(def.center.x + node.local.x * def.radius, 3);
      expect(node.y).toBeCloseTo(def.center.y + node.local.y * def.radius, 3);
    }
    expect(map.clusters.map((c) => [c.id, c.count])).toEqual([
      ['android', 2],
      ['cloud', 0],
      ['ai', 1],
      ['fundamentals', 0],
    ]);
  });

  it('does not move a node when an item in another cluster is added', async () => {
    const before = buildMap({
      items,
      vectors: await vectorsFor(items, texts),
      embeddings,
      threshold: 0.3,
    });
    const more = [...items, item({ id: 'd', topic: 'cloud' })];
    const after = buildMap({
      items: more,
      vectors: await vectorsFor(more, { ...texts, d: 'aws lambda' }),
      embeddings,
      threshold: 0.3,
    });
    for (const node of before.nodes) {
      expect(after.nodes.find((n) => n.id === node.id)).toEqual(node);
    }
  });

  it('projects a vector the same way every time and separates close nodes', async () => {
    const [v] = await createFakeProvider().embed(['x y z'], 'document');
    expect(projectToDisc(v!)).toEqual(projectToDisc(v!));

    const twins = [
      item({ id: 'x', topic: 'ai' }),
      item({ id: 'y', topic: 'ai' }),
    ];
    const same = new Map(twins.map((t) => [t.id, v!]));
    const map = buildMap({
      items: twins,
      vectors: same,
      embeddings,
      threshold: 0.3,
    });
    const [p, q] = map.nodes;
    expect(
      Math.hypot(p!.local.x - q!.local.x, p!.local.y - q!.local.y),
    ).toBeGreaterThan(0.25);
  });

  it('works with a single item', async () => {
    const one = [item({ id: 'solo', topic: 'cloud' })];
    const map = buildMap({
      items: one,
      vectors: await vectorsFor(one, {}),
      embeddings,
      threshold: 0.3,
    });
    expect(map.nodes).toHaveLength(1);
    expect(map.edges).toEqual([]);
  });
});

describe('edges', () => {
  it('combines related, app and similarity without duplicates or drafts', async () => {
    const items = [
      item({ id: 'a', topic: 'android', related: ['b', 'ghost'], tags: [] }),
      item({ id: 'b', topic: 'android' }),
      item({ id: 'c', topic: 'ai', app: 'a' }),
      item({ id: 'd', topic: 'ai' }),
    ];
    const vectors = await vectorsFor(items, {
      a: 'android compose kotlin',
      b: 'android compose kotlin room',
      c: 'modelos lenguaje evaluaciones',
      d: 'zzz yyy',
    });
    const { edges } = buildMap({ items, vectors, embeddings, threshold: 0.3 });
    const find = (s: string, t: string) =>
      edges.find((e) => e.source === s && e.target === t);

    expect(find('a', 'b')?.reasons).toEqual(['related', 'similarity']); // both directions merged
    expect(find('a', 'c')?.reasons).toEqual(['app']);
    expect(find('a', 'c')?.bridge).toBe(true);
    expect(find('a', 'b')?.bridge).toBe(false);
    expect(
      edges.some((e) => e.source === 'ghost' || e.target === 'ghost'),
    ).toBe(false);
    expect(find('b', 'a')).toBeUndefined(); // always source < target
    expect(find('c', 'd')).toBeUndefined(); // below threshold
    expect(new Set(edges.map((e) => `${e.source}|${e.target}`)).size).toBe(
      edges.length,
    );
  });

  it('keeps only the k nearest neighbours', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) =>
      item({ id, topic: 'android' }),
    );
    const vectors = await vectorsFor(items, {
      a: 'android android compose',
      b: 'android compose',
      c: 'android compose kotlin',
      d: 'android compose room',
      e: 'android compose sync',
    });
    const { edges } = buildMap({
      items,
      vectors,
      embeddings,
      threshold: 0.1,
      k: 1,
    });
    // k = 1 -> at most one similarity edge started from each node.
    expect(edges.length).toBeLessThanOrEqual(items.length);
  });
});
