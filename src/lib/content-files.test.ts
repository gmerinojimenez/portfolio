import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { validateContent, type RawEntry } from './content-core';
import {
  companySchema,
  itemSchema,
  noteSchema,
  type CompanyData,
  type ItemData,
  type NoteData,
} from './content-schema';

/**
 * Validates the real files in src/content (fixtures included) the same way
 * Astro does: schema per file, then cross-file references. Astro's own loader
 * cannot run inside Vitest, so this test reads the raw files via Vite.
 * It passes with no files at all, so deleting src/content/fixtures is safe.
 */
const files = import.meta.glob<string>(
  ['../content/**/*.{md,yaml}', '!../content/_templates/**'],
  { query: '?raw', import: 'default', eager: true },
);
const templates = import.meta.glob<string>('../content/_templates/item.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function splitFrontmatter(text: string): { data: unknown; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Missing frontmatter block');
  return { data: parse(match[1] ?? '') ?? {}, body: match[2] ?? '' };
}

/** Same ids Astro generates: path relative to src/content, no extension. */
const collectionId = (file: string) =>
  file.replace('../content/', '').replace(/\.[^.]+$/, '');

/** Entries whose path starts with one of `folders` and ends with `ext`. */
function load<T>(
  folders: string[],
  ext: string,
  parseData: (data: unknown) => T,
  errors: string[],
): RawEntry<T>[] {
  const entries: RawEntry<T>[] = [];
  for (const [file, text] of Object.entries(files)) {
    const id = collectionId(file);
    if (!file.endsWith(ext) || !folders.some((f) => id.startsWith(`${f}/`))) {
      continue;
    }
    try {
      if (ext === '.yaml') {
        entries.push({ id, data: parseData(parse(text)) });
      } else {
        const { data, body } = splitFrontmatter(text);
        entries.push({ id, data: parseData(data), body });
      }
    } catch (error) {
      errors.push(
        `${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return entries;
}

describe('content files', () => {
  const errors: string[] = [];
  const items = load<ItemData>(
    ['items', 'fixtures/items'],
    '.md',
    (d) => itemSchema.parse(d),
    errors,
  );
  const notes = load<NoteData>(
    ['notes', 'fixtures/notes'],
    '.md',
    (d) => noteSchema.parse(d),
    errors,
  );
  const companies = load<CompanyData>(
    ['companies', 'fixtures/companies'],
    '.yaml',
    (d) => companySchema.parse(d),
    errors,
  );

  it('every file matches its schema', () => {
    expect(errors).toEqual([]);
  });

  it('every reference (related, app, company) points to an existing id', () => {
    expect(validateContent({ items, notes, companies })).toEqual([]);
  });

  it('the item template is itself valid', () => {
    const template = Object.values(templates)[0] ?? '';
    expect(() =>
      itemSchema.parse(splitFrontmatter(template).data),
    ).not.toThrow();
  });
});
