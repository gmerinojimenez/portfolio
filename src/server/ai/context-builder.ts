/**
 * Builds the AI context from the content files. Astro's `getCollection` only
 * runs inside Astro, so this reads src/content directly (like
 * src/lib/content-files.test.ts) and reuses the same schemas and the same
 * `localize`/`visible`/`validateContent` logic as the site.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import {
  localize,
  validateContent,
  visible,
  type ContentSnapshot,
  type Localized,
  type RawEntry,
} from '../../lib/content-core';
import {
  companySchema,
  itemSchema,
  noteSchema,
  type CompanyData,
  type ItemData,
  type NoteData,
} from '../../lib/content-schema';
import { locales, type Locale } from '../../lib/locales';
import {
  CONTEXT_FILE_NAME,
  type AiContextFile,
  type LocaleContext,
  type SourceRef,
} from './context';

export interface BuildOptions {
  /** Only sample data (src/content/fixtures). Used by the eval. */
  fixturesOnly?: boolean;
}

function listFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function splitFrontmatter(text: string): { data: unknown; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Missing frontmatter block');
  return { data: parse(match[1] ?? '') ?? {}, body: match[2] ?? '' };
}

/** Reads and schema-validates every content file under `contentRoot`. */
export function readContentSnapshot(contentRoot: string): ContentSnapshot {
  const errors: string[] = [];
  const snapshot: ContentSnapshot = { items: [], notes: [], companies: [] };

  for (const file of listFiles(contentRoot)) {
    const id = relative(contentRoot, file)
      .split(sep)
      .join('/')
      .replace(/\.[^.]+$/, '');
    if (id.startsWith('_templates/')) continue;
    const collection = id.replace(/^fixtures\//, '').split('/')[0];
    try {
      const text = readFileSync(file, 'utf8');
      if (collection === 'companies' && file.endsWith('.yaml')) {
        snapshot.companies.push({ id, data: companySchema.parse(parse(text)) });
      } else if (collection === 'items' && file.endsWith('.md')) {
        const { data, body } = splitFrontmatter(text);
        snapshot.items.push({ id, data: itemSchema.parse(data), body });
      } else if (collection === 'notes' && file.endsWith('.md')) {
        const { data, body } = splitFrontmatter(text);
        snapshot.notes.push({ id, data: noteSchema.parse(data), body });
      }
    } catch (error) {
      errors.push(
        `${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  errors.push(...validateContent(snapshot));
  if (errors.length > 0) {
    throw new Error(`Invalid content:\n- ${errors.join('\n- ')}`);
  }
  return snapshot;
}

const labels = {
  es: { present: 'actualidad' },
  en: { present: 'present' },
} as const;

function companyLine(
  companies: RawEntry<CompanyData>[],
  id: string | undefined,
): string | undefined {
  if (!id) return undefined;
  const company = companies.find((c) => c.id.split('/').pop() === id);
  if (!company) return id;
  const { name, location } = company.data;
  return location ? `${name} (${location})` : name;
}

function field(name: string, value: string | undefined): string[] {
  return value ? [`${name}: ${value}`] : [];
}

function renderItem(
  item: Localized<ItemData>,
  companies: RawEntry<CompanyData>[],
  locale: Locale,
): string {
  const d = item.data;
  const to = d.to === 'present' ? labels[locale].present : d.to;
  const dates = d.from ? (to ? `${d.from} – ${to}` : d.from) : undefined;
  const lines = [
    `<item id="${item.id}" type="${d.type}" lang="${item.lang}">`,
    ...field('title', d.title),
    ...field('summary', d.summary),
    ...field('company', companyLine(companies, d.company)),
    ...field('role', d.role),
    ...field('dates', dates),
    ...field('topic', d.topic),
    ...field('tags', d.tags.join(', ')),
    ...field('part_of', d.app),
    ...field('related', d.related.join(', ')),
    ...field(
      'links',
      d.links.map((link) => `${link.label} <${link.url}>`).join('; '),
    ),
    '',
    item.body.trim(),
    '</item>',
  ];
  return lines.join('\n');
}

function renderNote(note: Localized<NoteData>): string {
  const d = note.data;
  return [
    `<note id="${note.id}" lang="${note.lang}">`,
    ...field('title', d.title),
    ...field('summary', d.summary),
    ...field('date', d.date),
    ...field('tags', d.tags.join(', ')),
    ...field('about', d.related.join(', ')),
    '',
    note.body.trim(),
    '</note>',
  ].join('\n');
}

export const estimateDocumentTokens = (text: string): number =>
  Math.ceil(text.length / 3.5);

export function buildLocaleContext(
  snapshot: ContentSnapshot,
  locale: Locale,
  options: BuildOptions = {},
): LocaleContext {
  const keep = <T>(list: Localized<T>[]) =>
    options.fixturesOnly ? list.filter((entry) => entry.fixture) : list;
  // The AI only ever sees published content, in every stage.
  const items = keep(visible(localize(snapshot.items, locale), false));
  const notes = keep(visible(localize(snapshot.notes, locale), false));

  const sections = [
    ...items.map((item) => renderItem(item, snapshot.companies, locale)),
    ...notes.map(renderNote),
  ];
  const document = [
    `<portfolio_content locale="${locale}">`,
    ...sections,
    '</portfolio_content>',
  ].join('\n\n');

  const sources: SourceRef[] = [
    ...items.map((i) => ({
      id: i.id,
      kind: 'item' as const,
      title: i.data.title,
    })),
    ...notes.map((n) => ({
      id: n.id,
      kind: 'note' as const,
      title: n.data.title,
    })),
  ];
  return {
    document,
    sources,
    estimatedTokens: estimateDocumentTokens(document),
  };
}

export function buildAiContext(
  snapshot: ContentSnapshot,
  options: BuildOptions = {},
): AiContextFile {
  const result = {} as Record<Locale, LocaleContext>;
  for (const locale of locales) {
    result[locale] = buildLocaleContext(snapshot, locale, options);
  }
  return { version: 1, locales: result };
}

export const DEFAULT_CONTEXT_DIR = '.ai-context';

/**
 * Builds the context from `contentRoot` and writes `<outDir>/context.json`.
 * Called by `sst deploy` (sst.config.ts) and by `pnpm ai:context`.
 */
export function writeAiContext(
  contentRoot = 'src/content',
  outDir = DEFAULT_CONTEXT_DIR,
  options: BuildOptions = {},
): { path: string; context: AiContextFile } {
  const context = buildAiContext(readContentSnapshot(contentRoot), options);
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, CONTEXT_FILE_NAME);
  writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`);
  return { path, context };
}
