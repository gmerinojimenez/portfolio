/**
 * Reads the Markdown content straight from disk, outside Astro, for build
 * scripts (embeddings, translation). Same schemas and ids as the site itself.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  itemSchema,
  noteSchema,
  type ItemData,
  type NoteData,
} from '../../src/lib/content-schema';
import type { Locale } from '../../src/lib/locales';

export const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
export const contentRoot = join(repoRoot, 'src/content');

export type Kind = 'item' | 'note';

export interface SourceEntry<T> {
  kind: Kind;
  id: string;
  lang: Locale;
  fixture: boolean;
  /** Absolute path of the Markdown file. */
  file: string;
  data: T;
  /** Markdown body without the frontmatter. */
  body: string;
  /** Frontmatter as written (no defaults applied). */
  rawData: Record<string, unknown>;
}

export function splitFrontmatter(text: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Missing frontmatter block');
  const data = parse(match[1] ?? '') ?? {};
  return { data, body: match[2] ?? '' };
}

function readFolder<T>(
  dir: string,
  kind: Kind,
  lang: Locale,
  fixture: boolean,
  parseData: (data: unknown) => T,
): SourceEntry<T>[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const file = join(dir, name);
      try {
        const { data, body } = splitFrontmatter(readFileSync(file, 'utf8'));
        return {
          kind,
          id: name.replace(/\.md$/, ''),
          lang,
          fixture,
          file,
          data: parseData(data),
          body,
          rawData: data,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${file}: ${reason}`, { cause: error });
      }
    });
}

export interface LoadedContent {
  items: SourceEntry<ItemData>[];
  notes: SourceEntry<NoteData>[];
}

/** Every item and note (real + fixtures, both languages, drafts included). */
export function loadContent(root: string = contentRoot): LoadedContent {
  const items: SourceEntry<ItemData>[] = [];
  const notes: SourceEntry<NoteData>[] = [];
  for (const [base, fixture] of [
    [root, false],
    [join(root, 'fixtures'), true],
  ] as const) {
    for (const lang of ['es', 'en'] as const) {
      items.push(
        ...readFolder(join(base, 'items', lang), 'item', lang, fixture, (d) =>
          itemSchema.parse(d),
        ),
      );
      notes.push(
        ...readFolder(join(base, 'notes', lang), 'note', lang, fixture, (d) =>
          noteSchema.parse(d),
        ),
      );
    }
  }
  return { items, notes };
}
