/**
 * Pure content logic: no `astro:content` import, so Vitest can test it.
 * `content.ts` feeds it with the real collections.
 */
import type { Locale } from './locales';
import { defaultLocale } from './locales';
import type { CompanyData, ItemData, NoteData } from './content-schema';

/** A raw collection entry: what `getCollection()` returns, reduced to what we use. */
export interface RawEntry<T> {
  /** Path-like collection id, e.g. `items/es/my-app` or `fixtures/items/en/demo-x`. */
  id: string;
  data: T;
  body?: string | undefined;
}

export interface ParsedId {
  id: string;
  lang: Locale;
  fixture: boolean;
}

/** `fixtures/items/es/demo-x` -> { id: 'demo-x', lang: 'es', fixture: true }. */
export function parseEntryId(path: string): ParsedId {
  const parts = path.split('/');
  const fixture = parts[0] === 'fixtures';
  const id = parts[parts.length - 1];
  const lang = parts[parts.length - 2];
  if (!id || (lang !== 'es' && lang !== 'en')) {
    throw new Error(`Cannot read language/id from content path "${path}"`);
  }
  return { id, lang, fixture };
}

export interface Localized<T> {
  /** Stable id, identical in every language. */
  id: string;
  /** Language of the text in `data`/`body`. */
  lang: Locale;
  /** True when `en` was requested but the Spanish text is served instead. */
  fallback: boolean;
  /** True for sample data under src/content/fixtures. */
  fixture: boolean;
  data: T;
  /** Raw Markdown body (no frontmatter). */
  body: string;
}

type Textual = { title: string; summary?: string | undefined; tags: string[] };

/**
 * Groups raw entries by id and picks the right language.
 * The Spanish entry is the source of truth for structure (status, dates,
 * relations...). A reviewed English entry only replaces the text.
 */
export function localize<T extends Textual & { review: string }>(
  entries: RawEntry<T>[],
  locale: Locale,
): Localized<T>[] {
  const byId = new Map<
    string,
    { es?: RawEntry<T>; en?: RawEntry<T>; fixture: boolean }
  >();
  for (const entry of entries) {
    const { id, lang, fixture } = parseEntryId(entry.id);
    const slot = byId.get(id) ?? { fixture };
    slot[lang] = entry;
    byId.set(id, slot);
  }

  const result: Localized<T>[] = [];
  for (const [id, { es, en, fixture }] of [...byId].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!es) continue; // an orphan `en` is reported by validateContent
    const useEn = locale === 'en' && en?.data.review === 'reviewed';
    if (!useEn) {
      result.push({
        id,
        lang: defaultLocale,
        fallback: locale !== defaultLocale,
        fixture,
        data: es.data,
        body: es.body ?? '',
      });
      continue;
    }
    result.push({
      id,
      lang: 'en',
      fallback: false,
      fixture,
      data: {
        ...es.data,
        title: en!.data.title,
        summary: en!.data.summary ?? es.data.summary,
        tags: en!.data.tags.length > 0 ? en!.data.tags : es.data.tags,
      },
      body: en!.body ?? '',
    });
  }
  return result;
}

/** Keeps drafts only when asked (dev). */
export function visible<T extends { status: string }>(
  list: Localized<T>[],
  includeDrafts: boolean,
): Localized<T>[] {
  return includeDrafts
    ? list
    : list.filter((e) => e.data.status === 'published');
}

export interface ContentSnapshot {
  items: RawEntry<ItemData>[];
  notes: RawEntry<NoteData>[];
  companies: RawEntry<CompanyData>[];
}

/**
 * Cross-file checks that a per-file schema cannot do. Returns human-readable
 * errors (empty array = valid). Drafts are checked too, so mistakes surface early.
 */
export function validateContent(snapshot: ContentSnapshot): string[] {
  const errors: string[] = [];
  const itemIds = new Set<string>();
  const slots = new Map<string, Set<Locale>>();

  for (const entry of snapshot.items) {
    const { id, lang } = parseEntryId(entry.id);
    itemIds.add(id);
    const langs = slots.get(id) ?? new Set<Locale>();
    if (langs.has(lang)) errors.push(`items: duplicate id "${id}" in ${lang}`);
    langs.add(lang);
    slots.set(id, langs);
  }

  const companyIds = new Set<string>();
  for (const entry of snapshot.companies) {
    const id = entry.id.split('/').pop() ?? entry.id;
    if (companyIds.has(id)) errors.push(`companies: duplicate id "${id}"`);
    companyIds.add(id);
  }

  for (const [id, langs] of slots) {
    if (langs.has('en') && !langs.has('es')) {
      errors.push(`items: "${id}" has an English file but no Spanish source`);
    }
  }

  for (const entry of snapshot.items) {
    const { id, lang } = parseEntryId(entry.id);
    if (lang !== 'es') continue; // structure is read from the Spanish source
    const { company, app, related } = entry.data;
    if (company && !companyIds.has(company)) {
      errors.push(`items: "${id}" references unknown company "${company}"`);
    }
    if (app && !itemIds.has(app)) {
      errors.push(`items: "${id}" references unknown app "${app}"`);
    }
    if (app === id) errors.push(`items: "${id}" lists itself as its app`);
    for (const target of related) {
      if (target === id) errors.push(`items: "${id}" lists itself in related`);
      else if (!itemIds.has(target)) {
        errors.push(
          `items: "${id}" has related id "${target}" that does not exist`,
        );
      }
    }
  }

  for (const entry of snapshot.notes) {
    const { id, lang } = parseEntryId(entry.id);
    if (lang !== 'es') continue;
    for (const target of entry.data.related) {
      if (!itemIds.has(target)) {
        errors.push(
          `notes: "${id}" has related id "${target}" that does not exist`,
        );
      }
    }
  }

  return errors;
}
