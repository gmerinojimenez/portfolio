/**
 * Technology catalog (S15): the stacks and their technologies, declared once
 * in `src/content/tech.yaml` and referenced by id from each item's `stack`
 * field, like a Gradle version catalog (`libs.versions.toml`) referenced from
 * each module's dependencies.
 *
 * Pure functions only (no `astro:content`, no `fs`): the site, the console
 * tests and the AI context builder all feed it the YAML text themselves.
 */
import { z } from 'astro/zod';
import { parse } from 'yaml';
import type { Locale } from './locales';

const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');

const techSchema = z.object({
  id: slug,
  /** Visible name, never translated: `Jetpack Compose`. */
  name: z.string().min(1),
  /** Other names job offers use: `Compose`, `Jetpack Room`… */
  aliases: z.array(z.string().min(1)).default([]),
});

const stackSchema = z.object({
  id: slug,
  label: z.object({ es: z.string().min(1), en: z.string().min(1) }),
  techs: z.array(techSchema).min(1),
});

export const techCatalogSchema = z.array(stackSchema).min(1);

export type Tech = z.infer<typeof techSchema>;
export type Stack = z.infer<typeof stackSchema>;
export type TechCatalog = z.infer<typeof techCatalogSchema>;

/** Lowercase, no accents, single spaces: how names and queries are compared. */
export function normalizeTechName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .trim();
}

/** Problems a schema can't see: repeated ids, names or aliases. */
export function validateCatalog(catalog: TechCatalog): string[] {
  const errors: string[] = [];
  const stackIds = new Set<string>();
  const techIds = new Map<string, string>();
  const names = new Map<string, string>();
  for (const stack of catalog) {
    if (stackIds.has(stack.id)) {
      errors.push(`tech: duplicate stack "${stack.id}"`);
    }
    stackIds.add(stack.id);
    for (const tech of stack.techs) {
      const other = techIds.get(tech.id);
      if (other) {
        errors.push(
          `tech: "${tech.id}" is in stacks "${other}" and "${stack.id}"`,
        );
      }
      techIds.set(tech.id, stack.id);
      for (const name of [tech.id, tech.name, ...tech.aliases]) {
        const key = normalizeTechName(name);
        const owner = names.get(key);
        if (owner && owner !== tech.id) {
          errors.push(
            `tech: name or alias "${name}" is used by "${owner}" and "${tech.id}"`,
          );
        }
        names.set(key, tech.id);
      }
    }
  }
  return errors;
}

/** Parses and checks `tech.yaml`. Throws with every problem found. */
export function parseTechCatalog(yaml: string): TechCatalog {
  const catalog = techCatalogSchema.parse(parse(yaml));
  const errors = validateCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(`Invalid tech catalog:\n- ${errors.join('\n- ')}`);
  }
  return catalog;
}

export function techIds(catalog: TechCatalog): Set<string> {
  return new Set(catalog.flatMap((stack) => stack.techs.map((t) => t.id)));
}

// ------------------------------------------------------------ derived data

/** A technology an item used, and since when if later than the item. */
export interface StackUse {
  readonly id: string;
  readonly from?: string | undefined;
}

/** `stack` entries as written in the content (`room` or `{ id, from }`). */
export function toStackUses(
  entries: readonly (string | { id: string; from: string })[] | undefined,
): StackUse[] {
  return (entries ?? []).map((entry) =>
    typeof entry === 'string' ? { id: entry } : { ...entry },
  );
}

export const stackIdsOf = (
  entries: readonly (string | { id: string })[] | undefined,
): string[] =>
  (entries ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry.id,
  );

/** What the console and the pages need to know about an item. */
export interface StackItem {
  readonly id: string;
  readonly stack?: readonly StackUse[] | undefined;
  /** `YYYY[-MM[-DD]]`. */
  readonly from?: string | undefined;
  /** `YYYY[-MM[-DD]]` or `present`. */
  readonly to?: string | undefined;
}

export interface TechSummary {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** Ids of the items that use it, most recent first. */
  readonly items: readonly string[];
  /** Earliest `from` of those items (year), if any has one. */
  readonly from?: string | undefined;
  /** Latest end: a year, or `present`. */
  readonly to?: string | undefined;
}

export interface StackSummary {
  readonly id: string;
  readonly label: string;
  /** Only technologies used by at least one item. */
  readonly techs: readonly TechSummary[];
}

const year = (date: string | undefined) => date?.slice(0, 4);

/**
 * Items without an end that belong to an app (projects inside Merlyn's
 * assistant) last as long as the app, not just their start year.
 */
export function inheritAppEnds<
  T extends StackItem & { app?: string | undefined },
>(items: readonly T[]): StackItem[] {
  const ends = new Map(items.map((i) => [i.id, i.to]));
  return items.map((item) =>
    item.to === undefined && item.app && ends.get(item.app)
      ? { ...item, to: ends.get(item.app) }
      : item,
  );
}

/** End of an item in time: its `to`, else its `from` (a point in time). */
const endOf = (item: StackItem) =>
  item.to === 'present' ? 'present' : year(item.to ?? item.from);

function laterEnd(a: string | undefined, b: string | undefined) {
  if (a === 'present' || b === 'present') return 'present';
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Stacks in catalog order, each with the technologies that some item uses.
 * Inside a stack: most items first, then the most recent, then by name.
 * Stacks left empty are dropped.
 */
export function summarizeStacks(
  catalog: TechCatalog,
  items: readonly StackItem[],
  locale: Locale,
): StackSummary[] {
  const recent = [...items].sort((a, b) =>
    (b.from ?? '').localeCompare(a.from ?? ''),
  );
  return catalog
    .map((stack): StackSummary => {
      const techs = stack.techs
        .map((tech): TechSummary => {
          const uses = recent.flatMap((item) => {
            const use = item.stack?.find((u) => u.id === tech.id);
            return use ? [{ item, from: year(use.from ?? item.from) }] : [];
          });
          const using = uses.map((u) => u.item);
          const froms = uses.flatMap((u) => u.from ?? []).sort();
          return {
            id: tech.id,
            name: tech.name,
            aliases: tech.aliases,
            items: using.map((i) => i.id),
            from: froms[0],
            to: using.map(endOf).reduce(laterEnd, undefined),
          };
        })
        .filter((tech) => tech.items.length > 0)
        .sort(
          (a, b) =>
            b.items.length - a.items.length ||
            rank(b.to).localeCompare(rank(a.to)) ||
            a.name.localeCompare(b.name),
        );
      return { id: stack.id, label: stack.label[locale], techs };
    })
    .filter((stack) => stack.techs.length > 0);
}

/** `present` sorts after every year. */
const rank = (end: string | undefined) =>
  end === 'present' ? '9999' : (end ?? '');

/** An item's technologies grouped by stack, in catalog order. */
export interface ItemStackGroup {
  readonly id: string;
  readonly label: string;
  readonly techs: readonly { readonly id: string; readonly name: string }[];
}

export function itemStackGroups(
  catalog: TechCatalog,
  stack: readonly (string | { id: string })[] | undefined,
  locale: Locale,
): ItemStackGroup[] {
  if (!stack?.length) return [];
  const used = new Set(stackIdsOf(stack));
  return catalog
    .map((group) => ({
      id: group.id,
      label: group.label[locale],
      techs: group.techs
        .filter((tech) => used.has(tech.id))
        .map(({ id, name }) => ({ id, name })),
    }))
    .filter((group) => group.techs.length > 0);
}

/** A technology by id, name or alias, ignoring case and accents. */
export function findTech(
  stacks: readonly StackSummary[],
  query: string,
): TechSummary | undefined {
  const key = normalizeTechName(query);
  if (!key) return undefined;
  for (const stack of stacks) {
    for (const tech of stack.techs) {
      const names = [tech.id, tech.name, ...tech.aliases];
      if (names.some((name) => normalizeTechName(name) === key)) return tech;
    }
  }
  return undefined;
}
