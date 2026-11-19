/**
 * The `content:embed` pipeline: content -> embeddings cache, reserved for
 * the semantic search (S14). The map no longer uses embeddings (ADR 0015).
 * Split from the CLI so tests can run it against a temp folder.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadContent, repoRoot } from './content-source';
import {
  buildEmbeddingText,
  createFakeProvider,
  createVoyageProvider,
  emptyCache,
  EMBEDDING_DIMENSIONS,
  findMisses,
  parseCache,
  serializeCache,
  syncCache,
  type EmbeddingCache,
  type EmbeddingProvider,
  type EmbedJob,
} from './embeddings';

export const dataDir = join(repoRoot, 'src/data');

export interface EmbedOptions {
  contentRoot?: string;
  dataDir?: string;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  /** Do not write; report whether the generated files are up to date. */
  check?: boolean;
  /** Force the fake provider. */
  fake?: boolean;
  log?: (line: string) => void;
}

export interface EmbedResult {
  computed: string[];
  reused: string[];
  provider: string;
  /** With `check`: false when a file would change. */
  upToDate: boolean;
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * Provider choice (spec S06): EMBEDDINGS_PROVIDER wins; otherwise Voyage when
 * a key exists; otherwise the fake one, but never on top of a real cache.
 */
export function chooseProvider(
  cache: EmbeddingCache,
  options: Pick<EmbedOptions, 'env' | 'fake' | 'fetchFn'>,
): EmbeddingProvider {
  const env = options.env ?? process.env;
  const wanted = options.fake ? 'fake' : env.EMBEDDINGS_PROVIDER;
  const apiKey = env.VOYAGE_API_KEY;
  if (wanted === 'fake') return createFakeProvider();
  if (wanted === 'voyage' || apiKey) {
    if (!apiKey)
      throw new Error('EMBEDDINGS_PROVIDER=voyage needs VOYAGE_API_KEY');
    return createVoyageProvider({
      apiKey,
      ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    });
  }
  if (cache.provider === 'fake' || Object.keys(cache.entries).length === 0) {
    return createFakeProvider();
  }
  throw new Error(
    'There is content to embed but no VOYAGE_API_KEY, and the committed ' +
      `embeddings come from "${cache.provider}". Set VOYAGE_API_KEY (or use ` +
      '--fake to start over with fake vectors).',
  );
}

export async function runEmbed(
  options: EmbedOptions = {},
): Promise<EmbedResult> {
  const log = options.log ?? (() => undefined);
  const out = options.dataDir ?? dataDir;
  const cachePath = join(out, 'embeddings.json');

  const { items, notes } = loadContent(options.contentRoot);
  const itemsEs = items.filter(
    (e) => e.lang === 'es' && e.data.status === 'published',
  );
  const notesEs = notes.filter(
    (e) => e.lang === 'es' && e.data.status === 'published',
  );

  const jobs: EmbedJob[] = [
    ...itemsEs.map((e) => ({
      key: `item/${e.id}`,
      text: buildEmbeddingText({ ...e.data, body: e.body }),
    })),
    ...notesEs.map((e) => ({
      key: `note/${e.id}`,
      text: buildEmbeddingText({ ...e.data, body: e.body }),
    })),
  ];

  const cacheText = readIfExists(cachePath);
  const current: EmbeddingCache = cacheText
    ? parseCache(cacheText)
    : emptyCache({
        provider: 'fake',
        model: createFakeProvider().model,
        dimensions: EMBEDDING_DIMENSIONS,
      });

  // The provider (and the API key) is only needed when something is stale.
  const wanted = options.fake
    ? 'fake'
    : (options.env ?? process.env).EMBEDDINGS_PROVIDER;
  const stale = findMisses(jobs, current).length > 0;
  const needsProvider = stale || (!!wanted && wanted !== current.provider);
  const provider = needsProvider ? chooseProvider(current, options) : undefined;

  const { cache, computed, reused } = await syncCache(jobs, current, provider);
  const cacheOut = serializeCache(cache);

  log(
    `${jobs.length} published entries: ${computed.length} embedded with ` +
      `${cache.provider}, ${reused.length} reused from the cache.`,
  );

  const upToDate = cacheOut === cacheText;
  if (options.check) {
    log(
      upToDate
        ? 'Generated files are up to date.'
        : 'Generated files are STALE.',
    );
  } else if (!upToDate) {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, cacheOut);
    log(`Wrote ${cachePath}.`);
  } else {
    log('Nothing changed.');
  }
  return { computed, reused, provider: cache.provider, upToDate };
}
