/**
 * CV versions (S16): what goes into the general CV and the two hidden ones
 * (AI and Android), all derived from the same content as the site and the
 * AI. `src/content/cv.yaml` holds only the editorial part (title, summary,
 * skills order, manual picks).
 *
 * Pure functions only, like `tech.ts`: pages, tests and the console feed
 * them already loaded data. In Android terms, one data layer and several
 * "views" of it, each with its own filter.
 */
import { z } from 'astro/zod';
import { parse } from 'yaml';
import type { Locale } from './locales';
import type { TechCatalog } from './tech';

// ------------------------------------------------------------ lenses

export const CV_LENSES = ['general', 'ai', 'android'] as const;
export type CvLens = (typeof CV_LENSES)[number];
/** The lenses a visit can choose with `?track=`; `general` is the default. */
export type CvTrack = Exclude<CvLens, 'general'>;
export const CV_TRACKS = ['ai', 'android'] as const satisfies CvTrack[];

/** URL segment of each hidden lens per language: `/es/cv/ia/`, `/en/cv/ai/`. */
export const CV_SLUGS: Record<CvTrack, Record<Locale, string>> = {
  ai: { es: 'ia', en: 'ai' },
  android: { es: 'android', en: 'android' },
};

export function cvPath(lens: CvLens, locale: Locale): string {
  return lens === 'general'
    ? `/${locale}/cv/`
    : `/${locale}/cv/${CV_SLUGS[lens][locale]}/`;
}

export function trackFromSlug(
  slug: string,
  locale: Locale,
): CvTrack | undefined {
  return CV_TRACKS.find((track) => CV_SLUGS[track][locale] === slug);
}

/**
 * Hidden CV pages: kept out of the sitemap (and marked `noindex`). Matches
 * `/es/cv/ia/`, `/en/cv/android/`… but not the public `/es/cv/`.
 */
export function isHiddenCvPath(pathname: string): boolean {
  const [, locale, section, slug] = pathname.split('/');
  if (section !== 'cv' || !slug) return false;
  return (
    (locale === 'es' || locale === 'en') &&
    trackFromSlug(slug, locale) !== undefined
  );
}

// ------------------------------------------------------------ config

const localized = z.object({ es: z.string().min(1), en: z.string().min(1) });
const localizedLines = z.object({
  es: z.array(z.string().min(1)).min(1),
  en: z.array(z.string().min(1)).min(1),
});
const ids = z.array(z.string().min(1)).default([]);

const lensSchema = z.object({
  /** Defaults to the profile's headline. */
  title: localized.optional(),
  /** Replaces the console intro on visits with `?track=`. */
  intro: localizedLines.optional(),
  /** Two or three sentences at the top of the CV. */
  summary: localized,
  /** Order of the skills section, by stack id from `tech.yaml`. */
  stacks: z.array(z.string().min(1)).min(1),
  include: ids,
  exclude: ids,
});

export const cvConfigSchema = z.object({
  general: lensSchema,
  ai: lensSchema,
  android: lensSchema,
});

export type CvLensConfig = z.infer<typeof lensSchema>;
export type CvConfig = z.infer<typeof cvConfigSchema>;

export function parseCvConfig(yaml: string): CvConfig {
  return cvConfigSchema.parse(parse(yaml));
}

/** Broken references: unknown item ids or stacks. */
export function validateCvConfig(
  config: CvConfig,
  itemIds: ReadonlySet<string>,
  catalog: TechCatalog,
): string[] {
  const stacks = new Set(catalog.map((stack) => stack.id));
  const errors: string[] = [];
  for (const lens of CV_LENSES) {
    const entry = config[lens];
    for (const id of [...entry.include, ...entry.exclude]) {
      if (!itemIds.has(id)) errors.push(`cv.${lens}: unknown item "${id}"`);
    }
    for (const id of entry.stacks) {
      if (!stacks.has(id)) errors.push(`cv.${lens}: unknown stack "${id}"`);
    }
  }
  return errors;
}

// ------------------------------------------------------------ selection

/** What the selection needs to know about an item. */
export interface CvItem {
  readonly id: string;
  readonly type: string;
  readonly topic?: string | undefined;
  readonly importance: number;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly companyId?: string | undefined;
  readonly role?: string | undefined;
  readonly personal: boolean;
  readonly cert: boolean;
  /** Technology and skill ids of its `stack` field. */
  readonly stackIds: readonly string[];
}

export interface CvCompany {
  readonly id: string;
  readonly stage?: string | undefined;
}

export interface CvExperience<I extends CvItem> {
  readonly companyId: string;
  /** Role of its most important item that states one. */
  readonly role?: string | undefined;
  /** Over all its items, whatever the lens. */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly bullets: readonly I[];
  /** No item of this company fits the lens: shown briefly. */
  readonly offLens: boolean;
}

export interface CvSelection<I extends CvItem> {
  readonly experience: readonly CvExperience<I>[];
  readonly projects: readonly I[];
  readonly education: readonly I[];
  readonly certificates: readonly I[];
  /** Stack ids in the order the skills section shows them. */
  readonly stacks: readonly string[];
}

export const MAX_BULLETS = 4;
/** Bullets of a company with nothing on the lens: just its headline item. */
export const MAX_OFF_LENS_BULLETS = 1;
export const MAX_PROJECTS = 4;

/** Ids of the technologies and skills of a stack. */
function stackMembers(catalog: TechCatalog, stackId: string): Set<string> {
  const stack = catalog.find((s) => s.id === stackId);
  return new Set([
    ...(stack?.techs ?? []).map((t) => t.id),
    ...(stack?.skills ?? []).map((s) => s.id),
  ]);
}

/** Does the item belong to the lens? `general` takes everything. */
export function fitsLens(
  item: CvItem,
  lens: CvLens,
  catalog: TechCatalog,
): boolean {
  if (lens === 'general') return true;
  if (item.topic === lens) return true;
  const members = stackMembers(catalog, lens);
  return item.stackIds.some((id) => members.has(id));
}

/** Most important first; on a tie, the item that states the role (usually
 * the company's main app), then the most recent. */
const byImportance = <I extends CvItem>(a: I, b: I) =>
  b.importance - a.importance ||
  Number(Boolean(b.role)) - Number(Boolean(a.role)) ||
  (b.from ?? '').localeCompare(a.from ?? '') ||
  a.id.localeCompare(b.id);

const endKey = (to: string | undefined, from: string | undefined) =>
  to === 'present' ? '9999' : (to ?? from ?? '');

function laterEnd(a: string | undefined, b: string | undefined) {
  if (a === 'present' || b === 'present') return 'present';
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function selectCv<I extends CvItem>(options: {
  items: readonly I[];
  companies: readonly CvCompany[];
  catalog: TechCatalog;
  config: CvConfig;
  lens: CvLens;
}): CvSelection<I> {
  const { items, companies, catalog, config, lens } = options;
  const entry = config[lens];
  const excluded = new Set(entry.exclude);
  const included = new Set(entry.include);
  const pick = (item: I) =>
    !excluded.has(item.id) &&
    (included.has(item.id) || fitsLens(item, lens, catalog));

  const isWork = (item: I) =>
    item.type !== 'education' && item.type !== 'post' && !item.personal;
  const stages = new Set(
    companies.filter((c) => c.stage).map((company) => company.id),
  );

  const experience = [...stages]
    .map((companyId): CvExperience<I> => {
      const all = items.filter(
        (item) => item.companyId === companyId && isWork(item),
      );
      const ranked = [...all].sort(byImportance);
      const onLens = ranked.filter(pick);
      const offLens = onLens.length === 0;
      const bullets = offLens
        ? ranked.filter((item) => !excluded.has(item.id))
        : onLens;
      const froms = all.flatMap((item) => item.from ?? []).sort();
      return {
        companyId,
        role: ranked.find((item) => item.role)?.role,
        from: froms[0],
        to: all.map((item) => item.to ?? item.from).reduce(laterEnd, undefined),
        bullets: bullets.slice(0, offLens ? MAX_OFF_LENS_BULLETS : MAX_BULLETS),
        offLens,
      };
    })
    .sort(
      (a, b) =>
        endKey(b.to, b.from).localeCompare(endKey(a.to, a.from)) ||
        (b.from ?? '').localeCompare(a.from ?? ''),
    );

  const projects = items
    .filter(
      (item) =>
        (item.personal || item.type === 'post') &&
        item.type !== 'education' &&
        pick(item),
    )
    .sort(byImportance)
    .slice(0, MAX_PROJECTS);

  const newestFirst = (a: I, b: I) =>
    (b.from ?? '').localeCompare(a.from ?? '') || a.id.localeCompare(b.id);
  const education = items
    .filter((item) => item.type === 'education' && !item.cert)
    .sort(newestFirst);
  const certificates = items
    .filter((item) => item.cert && pick(item))
    .sort(newestFirst);

  return {
    experience,
    projects,
    education,
    certificates,
    stacks: entry.stacks,
  };
}
