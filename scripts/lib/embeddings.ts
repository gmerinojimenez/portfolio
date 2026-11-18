/**
 * Embeddings: provider interface, deterministic fake provider, Voyage
 * provider and the content-hash cache (docs/specs/06-embeddings-map.md).
 */
import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 256;
/** Longest text sent to the model, in characters (cost and context guard). */
export const MAX_TEXT_CHARS = 24_000;

export type EmbedKind = 'document' | 'query';

export interface EmbeddingProvider {
  /** `fake` or `voyage`: stored in the cache to detect provider changes. */
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  /** Default cosine-similarity threshold for map edges with this provider. */
  readonly defaultThreshold: number;
  /** Returns one unit-length vector per text, in the same order. */
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

// ---------------------------------------------------------------- hashing

/** Short, stable fingerprint of a text (16 hex chars of SHA-256). */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export interface EmbeddableSource {
  title: string;
  summary?: string | undefined;
  tags: string[];
  body: string;
}

/** The exact text that gets embedded (and hashed) for an item or note. */
export function buildEmbeddingText(source: EmbeddableSource): string {
  const text = [
    source.title,
    source.summary ?? '',
    source.tags.join(', '),
    '',
    source.body.trim(),
  ]
    .join('\n')
    .trim();
  return text.slice(0, MAX_TEXT_CHARS);
}

// ------------------------------------------------------------ vector utils

export function normalize(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  return norm === 0 ? vector.slice() : vector.map((v) => v / norm);
}

/** Cosine similarity; equals the dot product for unit vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

// ---------------------------------------------------------- fake provider

function wordHash(word: string): number {
  return createHash('sha256').update(word).digest().readUInt32BE(0);
}

/**
 * Deterministic stand-in for tests and for working without a key: a signed
 * "hashing trick" bag of words. Texts that share words get similar vectors,
 * so edges and layout look plausible, but it knows nothing about meaning.
 */
export function createFakeProvider(
  dimensions = EMBEDDING_DIMENSIONS,
): EmbeddingProvider {
  return {
    id: 'fake',
    model: 'fake-bag-of-words-v1',
    dimensions,
    defaultThreshold: 0.3,
    embed(texts) {
      const vectors = texts.map((text) => {
        const vector = new Array<number>(dimensions).fill(0);
        const words = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
        for (const word of words) {
          const h = wordHash(word);
          const index = h % dimensions;
          vector[index] = (vector[index] ?? 0) + (h & 0x80000000 ? -1 : 1);
        }
        return normalize(vector);
      });
      return Promise.resolve(vectors);
    },
  };
}

// --------------------------------------------------------- Voyage provider

export interface VoyageOptions {
  apiKey: string;
  model?: string;
  dimensions?: number;
  /** Injected in tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  batchSize?: number;
  maxRetries?: number;
  /** Injected in tests to avoid real waiting. */
  sleep?: (ms: number) => Promise<void>;
}

interface VoyageResponse {
  data: { index: number; embedding: number[] }[];
}

/**
 * Voyage AI REST API: POST /v1/embeddings. Plain `fetch`, no SDK: it is one
 * call and this way tests can simulate it.
 */
export function createVoyageProvider(
  options: VoyageOptions,
): EmbeddingProvider {
  const model = options.model ?? 'voyage-4-lite';
  const dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS;
  const doFetch = options.fetchFn ?? fetch;
  const batchSize = options.batchSize ?? 64;
  const maxRetries = options.maxRetries ?? 4;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  async function request(
    input: string[],
    kind: EmbedKind,
  ): Promise<number[][]> {
    for (let attempt = 0; ; attempt++) {
      const response = await doFetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input,
          input_type: kind,
          output_dimension: dimensions,
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as VoyageResponse;
        const sorted = [...json.data].sort((a, b) => a.index - b.index);
        if (sorted.length !== input.length) {
          throw new Error(
            `Voyage returned ${sorted.length} vectors for ${input.length} texts`,
          );
        }
        return sorted.map((d) => normalize(d.embedding));
      }
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        throw new Error(
          `Voyage API error ${response.status}: ${await response.text()}`,
        );
      }
      await sleep(1000 * 2 ** attempt);
    }
  }

  return {
    id: 'voyage',
    model,
    dimensions,
    defaultThreshold: 0.5,
    async embed(texts, kind) {
      const result: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        result.push(...(await request(texts.slice(i, i + batchSize), kind)));
      }
      return result;
    },
  };
}

// ------------------------------------------------------------------ cache

export interface CacheEntry {
  hash: string;
  vector: number[];
}

export interface EmbeddingCache {
  version: 1;
  provider: string;
  model: string;
  dimensions: number;
  /** Keyed by `item/<id>` or `note/<id>`. */
  entries: Record<string, CacheEntry>;
}

export function emptyCache(
  info: Pick<EmbeddingCache, 'provider' | 'model' | 'dimensions'>,
): EmbeddingCache {
  return { version: 1, ...info, entries: {} };
}

export interface EmbedJob {
  /** Cache key, `item/<id>` or `note/<id>`. */
  key: string;
  text: string;
}

export interface SyncResult {
  cache: EmbeddingCache;
  /** Keys that had to be sent to the provider. */
  computed: string[];
  reused: string[];
}

const sameProvider = (
  cache: EmbeddingCache,
  p: Pick<EmbeddingProvider, 'id' | 'model' | 'dimensions'>,
) =>
  cache.provider === p.id &&
  cache.model === p.model &&
  cache.dimensions === p.dimensions;

/**
 * Which jobs are not covered by `cache`. A different provider covers none;
 * without `provider`, the cache's own provider is assumed.
 */
export function findMisses(
  jobs: EmbedJob[],
  cache: EmbeddingCache,
  provider?: Pick<EmbeddingProvider, 'id' | 'model' | 'dimensions'>,
): EmbedJob[] {
  if (provider && !sameProvider(cache, provider)) return jobs;
  return jobs.filter(
    (job) => cache.entries[job.key]?.hash !== hashText(job.text),
  );
}

/**
 * Brings the cache up to date: reuses vectors whose hash matches, asks the
 * provider only for the rest and drops entries that no longer exist.
 * `provider` may be undefined only when nothing needs computing (check with
 * `findMisses` against the cache's own provider first).
 */
export async function syncCache(
  jobs: EmbedJob[],
  cache: EmbeddingCache,
  provider: EmbeddingProvider | undefined,
): Promise<SyncResult> {
  const misses = findMisses(jobs, cache, provider);
  if (misses.length > 0 && !provider) {
    throw new Error('An embedding provider is needed to compute new vectors');
  }
  const usable =
    provider && !sameProvider(cache, provider)
      ? emptyCache({
          provider: provider.id,
          model: provider.model,
          dimensions: provider.dimensions,
        })
      : cache;
  const missKeys = new Set(misses.map((m) => m.key));

  const entries: Record<string, CacheEntry> = {};
  const reused: string[] = [];
  for (const job of jobs) {
    const hit = usable.entries[job.key];
    if (hit && !missKeys.has(job.key)) {
      entries[job.key] = hit;
      reused.push(job.key);
    }
  }

  if (misses.length > 0 && provider) {
    const vectors = await provider.embed(
      misses.map((m) => m.text),
      'document',
    );
    misses.forEach((job, i) => {
      const vector = vectors[i];
      if (!vector) throw new Error(`Missing vector for ${job.key}`);
      entries[job.key] = { hash: hashText(job.text), vector };
    });
  }

  const sorted: Record<string, CacheEntry> = {};
  for (const key of Object.keys(entries).sort()) sorted[key] = entries[key]!;
  return {
    cache: { ...usable, entries: sorted },
    computed: misses.map((m) => m.key),
    reused,
  };
}

// --------------------------------------------------------- serialization

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** One entry per line, so Git diffs show which items changed. */
export function serializeCache(cache: EmbeddingCache): string {
  const lines = Object.entries(cache.entries).map(
    ([key, entry]) =>
      `    ${JSON.stringify(key)}: ${JSON.stringify({
        hash: entry.hash,
        vector: entry.vector.map((v) => round(v, 5)),
      })}`,
  );
  return (
    `{\n  "version": 1,\n  "provider": ${JSON.stringify(cache.provider)},\n` +
    `  "model": ${JSON.stringify(cache.model)},\n  "dimensions": ${cache.dimensions},\n` +
    `  "entries": {\n${lines.join(',\n')}\n  }\n}\n`
  );
}

export function parseCache(text: string): EmbeddingCache {
  const json = JSON.parse(text) as EmbeddingCache;
  if (json.version !== 1)
    throw new Error('Unsupported embeddings cache version');
  return json;
}
