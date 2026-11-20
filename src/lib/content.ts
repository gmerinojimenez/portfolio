/**
 * Typed access to the content. This is the only module pages, the console, the
 * map and the AI context builder should use to read content.
 *
 * - Production build: only `status: published`. Dev server: drafts too.
 * - `locale: 'en'` serves the reviewed English text; otherwise the Spanish one
 *   with `fallback: true` so the UI can show a notice (ADR 0010).
 * - The first call validates cross-file references and throws on errors, so a
 *   broken `related` id fails `astro build` instead of reaching production.
 */
import { getCollection } from 'astro:content';
import type { Locale } from './locales';
import {
  localize,
  validateContent,
  visible,
  type ContentSnapshot,
  type Localized,
} from './content-core';
import type { CompanyData, ItemData, NoteData } from './content-schema';
import { techCatalog } from './tech-catalog';

export type Item = Localized<ItemData>;
export type Note = Localized<NoteData>;
export interface Company extends CompanyData {
  id: string;
}

export interface ContentOptions {
  /** Include drafts. Defaults to true in `astro dev`, false in `astro build`. */
  includeDrafts?: boolean;
}

const defaultIncludeDrafts = () => import.meta.env.DEV;

let snapshot: Promise<ContentSnapshot> | undefined;

function loadSnapshot(): Promise<ContentSnapshot> {
  snapshot ??= (async () => {
    const [items, notes, companies] = await Promise.all([
      getCollection('items'),
      getCollection('notes'),
      getCollection('companies'),
    ]);
    const loaded: ContentSnapshot = {
      items,
      notes,
      companies,
      tech: techCatalog,
    };
    const errors = validateContent(loaded);
    if (errors.length > 0) {
      throw new Error(`Invalid content:\n- ${errors.join('\n- ')}`);
    }
    return loaded;
  })();
  return snapshot;
}

/** All items in `locale`, sorted by id. */
export async function getItems(
  locale: Locale = 'es',
  options: ContentOptions = {},
): Promise<Item[]> {
  const { items } = await loadSnapshot();
  return visible(
    localize(items, locale),
    options.includeDrafts ?? defaultIncludeDrafts(),
  );
}

export async function getItem(
  id: string,
  locale: Locale = 'es',
  options: ContentOptions = {},
): Promise<Item | undefined> {
  return (await getItems(locale, options)).find((item) => item.id === id);
}

/** Items that `item` points to via `related`, skipping any that are not visible. */
export async function getRelated(
  item: Item,
  locale: Locale = 'es',
  options: ContentOptions = {},
): Promise<Item[]> {
  const all = await getItems(locale, options);
  return item.data.related
    .map((id) => all.find((candidate) => candidate.id === id))
    .filter((found): found is Item => found !== undefined);
}

export async function getNotes(
  locale: Locale = 'es',
  options: ContentOptions = {},
): Promise<Note[]> {
  const { notes } = await loadSnapshot();
  return visible(
    localize(notes, locale),
    options.includeDrafts ?? defaultIncludeDrafts(),
  );
}

export async function getCompanies(): Promise<Company[]> {
  const { companies } = await loadSnapshot();
  return companies
    .map((entry) => ({
      id: entry.id.split('/').pop() ?? entry.id,
      ...entry.data,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function getCompany(id: string): Promise<Company | undefined> {
  return (await getCompanies()).find((company) => company.id === id);
}
