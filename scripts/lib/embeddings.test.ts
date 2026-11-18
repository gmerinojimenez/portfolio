import { describe, expect, it, vi } from 'vitest';
import {
  buildEmbeddingText,
  cosine,
  createFakeProvider,
  createVoyageProvider,
  emptyCache,
  findMisses,
  hashText,
  parseCache,
  serializeCache,
  syncCache,
  type EmbedJob,
} from './embeddings';

const fake = createFakeProvider();
const emptyFake = () =>
  emptyCache({
    provider: fake.id,
    model: fake.model,
    dimensions: fake.dimensions,
  });

describe('hashing', () => {
  it('is stable and sensitive to every change', () => {
    expect(hashText('hola')).toBe(hashText('hola'));
    expect(hashText('hola')).not.toBe(hashText('hola '));
    expect(hashText('hola')).toHaveLength(16);
  });

  it('builds the embedded text from title, summary, tags and body', () => {
    const text = buildEmbeddingText({
      title: 'T',
      summary: 'S',
      tags: ['a', 'b'],
      body: '\n body \n',
    });
    expect(text).toBe('T\nS\na, b\n\nbody');
  });
});

describe('fake provider', () => {
  it('is deterministic and returns unit vectors', async () => {
    const [a] = await fake.embed(['app de banca android'], 'document');
    const [b] = await fake.embed(['app de banca android'], 'document');
    expect(a).toEqual(b);
    expect(a).toHaveLength(256);
    expect(cosine(a!, a!)).toBeCloseTo(1, 6);
  });

  it('puts texts that share words closer than unrelated ones', async () => {
    const [a, b, c] = await fake.embed(
      [
        'migración a jetpack compose en android',
        'migración de android a compose',
        'evaluación de modelos de lenguaje',
      ],
      'document',
    );
    expect(cosine(a!, b!)).toBeGreaterThan(cosine(a!, c!));
  });
});

describe('cache', () => {
  const jobs: EmbedJob[] = [
    { key: 'item/a', text: 'texto a' },
    { key: 'item/b', text: 'texto b' },
  ];

  it('computes everything the first time and nothing the second', async () => {
    const embed = vi.spyOn(fake, 'embed');
    const first = await syncCache(jobs, emptyFake(), fake);
    expect(first.computed).toEqual(['item/a', 'item/b']);

    embed.mockClear();
    const second = await syncCache(jobs, first.cache, undefined);
    expect(second.computed).toEqual([]);
    expect(second.reused).toEqual(['item/a', 'item/b']);
    expect(embed).not.toHaveBeenCalled();
    expect(second.cache).toEqual(first.cache);
    embed.mockRestore();
  });

  it('recomputes only the changed item', async () => {
    const first = await syncCache(jobs, emptyFake(), fake);
    const changed = [jobs[0]!, { key: 'item/b', text: 'texto b editado' }];
    expect(findMisses(changed, first.cache).map((j) => j.key)).toEqual([
      'item/b',
    ]);
    const second = await syncCache(changed, first.cache, fake);
    expect(second.computed).toEqual(['item/b']);
    expect(second.cache.entries['item/a']).toEqual(
      first.cache.entries['item/a'],
    );
  });

  it('drops entries that no longer exist', async () => {
    const first = await syncCache(jobs, emptyFake(), fake);
    const second = await syncCache([jobs[0]!], first.cache, undefined);
    expect(Object.keys(second.cache.entries)).toEqual(['item/a']);
  });

  it('invalidates everything when the model changes', async () => {
    const first = await syncCache(jobs, emptyFake(), fake);
    const other = { ...createFakeProvider(64), model: 'other' };
    const second = await syncCache(jobs, first.cache, other);
    expect(second.computed).toHaveLength(2);
    expect(second.cache.model).toBe('other');
    expect(second.cache.entries['item/a']?.vector).toHaveLength(64);
  });

  it('refuses to compute without a provider', async () => {
    await expect(syncCache(jobs, emptyFake(), undefined)).rejects.toThrow(
      /provider is needed/,
    );
  });

  it('survives a serialize/parse round trip', async () => {
    const { cache } = await syncCache(jobs, emptyFake(), fake);
    const text = serializeCache(cache);
    expect(serializeCache(parseCache(text))).toBe(text);
    // Rounding to 5 decimals keeps hashes valid and vectors almost identical.
    expect(parseCache(text).entries['item/a']?.hash).toBe(hashText('texto a'));
  });
});

describe('voyage provider (simulated fetch)', () => {
  const okResponse = (n: number) =>
    new Response(
      JSON.stringify({
        data: Array.from({ length: n }, (_, i) => ({
          index: n - 1 - i, // out of order on purpose
          embedding: [3, 4, i],
        })),
      }),
    );

  it('sends the documented request and returns ordered unit vectors', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(okResponse(2)));
    const provider = createVoyageProvider({
      apiKey: 'test-key',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const vectors = await provider.embed(['a', 'b'], 'query');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.voyageai.com/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-key',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'voyage-4-lite',
      input: ['a', 'b'],
      input_type: 'query',
      output_dimension: 256,
    });
    expect(vectors).toHaveLength(2);
    expect(vectors[0]?.[2]).toBeCloseTo(1 / Math.hypot(3, 4, 1)); // index 0 first
  });

  it('batches, and retries rate limits', async () => {
    let calls = 0;
    const fetchFn = vi.fn((_url: string, init: RequestInit) => {
      calls++;
      if (calls === 1)
        return Promise.resolve(new Response('slow down', { status: 429 }));
      const n = (JSON.parse(init.body as string) as { input: string[] }).input
        .length;
      return Promise.resolve(okResponse(n));
    });
    const provider = createVoyageProvider({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
      batchSize: 2,
      sleep: () => Promise.resolve(),
    });
    const vectors = await provider.embed(['a', 'b', 'c'], 'document');
    expect(vectors).toHaveLength(3);
    expect(fetchFn).toHaveBeenCalledTimes(3); // 429 + 2 batches
  });

  it('fails fast on client errors', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(new Response('bad key', { status: 401 })),
    );
    const provider = createVoyageProvider({
      apiKey: 'k',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.embed(['a'], 'document')).rejects.toThrow(/401/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
