/**
 * What the card shows, resolved at build time. Pure functions only (no
 * `astro:content`), so Vitest can test them and the browser can reuse the
 * types without pulling in the content layer.
 */
import type { Localized } from '../../lib/content-core';
import type { CompanyData, ItemData, ItemType } from '../../lib/content-schema';
import { isCertification, isPersonal } from '../../lib/item-kind';
import type { Locale } from '../../lib/locales';
import { itemPath } from '../../i18n/paths';
import { useTranslations } from '../../i18n/ui';
import {
  inheritAppEnds,
  itemStackGroups,
  toStackUses,
  type ItemStackGroup,
  type StackUse,
  type TechCatalog,
} from '../../lib/tech';

/** A pointer to another item (parent app, related items). */
export interface CardRef {
  readonly id: string;
  readonly title: string;
  readonly type: ItemType;
  readonly path: string;
}

export interface CardLink {
  readonly label: string;
  readonly url: string;
  readonly kind?: string | undefined;
}

/** Everything one card needs. Serializable: it travels as JSON to the page. */
export interface CardItem {
  readonly id: string;
  readonly type: ItemType;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  /** Technologies by stack, in catalog order (S15). */
  readonly stack: readonly ItemStackGroup[];
  /** The `stack` entries, for the technology summary. */
  readonly stackUses: readonly StackUse[];
  readonly topic?: string | undefined;
  readonly importance: number;
  /** Raw start date (`YYYY[-MM[-DD]]`), for sorting. */
  readonly from?: string | undefined;
  /** Raw end date, or `present`. */
  readonly to?: string | undefined;
  /** Human-readable dates, e.g. `2019 – 2022`. */
  readonly dates: string;
  /** Id of the company in the `companies` collection. */
  readonly companyId?: string | undefined;
  /** Side project (see `isPersonal`): grows on the map's personal stem. */
  readonly personal: boolean;
  /** A course certificate (see `isCertification`). */
  readonly cert: boolean;
  /** Map badge letters: the item's own, else undefined. */
  readonly badge?: string | undefined;
  /** Map badge letters of its company, for company and issuer groups. */
  readonly companyBadge?: string | undefined;
  /** Company name, or a generic context (Open source, Blog…). */
  readonly context: string;
  readonly role?: string | undefined;
  readonly parent?: CardRef | undefined;
  readonly related: readonly CardRef[];
  readonly links: readonly CardLink[];
  /** Language of the text (`es` when `fallback`). */
  readonly lang: Locale;
  /** `en` was requested but only the Spanish text exists (ADR 0010). */
  readonly fallback: boolean;
  /** Rendered Markdown body (trusted: it comes from our own content). */
  readonly bodyHtml: string;
  /** The item's own page, e.g. `/es/proyectos/<id>/`. */
  readonly path: string;
}

/** Node shape of each type, as on the map (ui-direction.md). */
export const TYPE_SHAPES: Record<ItemType, string> = {
  app: '○',
  project: '◎',
  education: '□',
  oss: '◇',
  post: '△',
};

/** `2019-03`/`2022-06` → `2019 – 2022`; same year → `2019`; open → `2019 – hoy`. */
export function formatDates(
  from: string | undefined,
  to: string | undefined,
  locale: Locale,
): string {
  const start = from?.slice(0, 4);
  if (!start) return '';
  if (to === undefined) return start;
  const end =
    to === 'present' ? useTranslations(locale).card.present : to.slice(0, 4);
  return end === start ? start : `${start} – ${end}`;
}

export function cardContext(
  data: Pick<ItemData, 'type' | 'links'>,
  company: string | undefined,
  locale: Locale,
): string {
  if (company) return company;
  const contexts = useTranslations(locale).card.contexts;
  switch (data.type) {
    case 'post':
      return data.links.some((l) => l.kind === 'medium')
        ? contexts.medium
        : contexts.post;
    case 'oss':
      return contexts.oss;
    case 'education':
      return contexts.education;
    default:
      return contexts.personal;
  }
}

/** Most important first, then most recent, then by title. */
export function compareItems(
  a: Pick<CardItem, 'importance' | 'from' | 'title'>,
  b: Pick<CardItem, 'importance' | 'from' | 'title'>,
): number {
  return (
    b.importance - a.importance ||
    (b.from ?? '').localeCompare(a.from ?? '') ||
    a.title.localeCompare(b.title)
  );
}

/** Cards as the stack summary (S15) sees them. */
export const toStackItems = (cards: readonly CardItem[]) =>
  inheritAppEnds(
    cards.map((card) => ({
      id: card.id,
      stack: card.stackUses,
      from: card.from,
      to: card.to,
      app: card.parent?.id,
    })),
  );

export interface CardInput {
  readonly items: readonly Localized<ItemData>[];
  readonly companies: readonly (CompanyData & { id: string })[];
  readonly locale: Locale;
  /** Rendered HTML body per item id. */
  readonly bodies?: ReadonlyMap<string, string>;
  /** Technology catalog (S15); without it cards show no stack. */
  readonly tech?: TechCatalog;
}

/**
 * Builds the cards of every visible item. Relations only point to items in
 * `items`, so a draft never shows up as "related" in production.
 * Related = explicit `related`, then items that list this one, then the
 * projects that belong to this app (deduplicated).
 */
export function toCardItems({
  items,
  companies,
  locale,
  bodies,
  tech = [],
}: CardInput): CardItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const companyBadge = new Map(companies.map((c) => [c.id, c.badge]));
  const ref = (id: string): CardRef | undefined => {
    const target = byId.get(id);
    return target
      ? {
          id,
          title: target.data.title,
          type: target.data.type,
          path: itemPath(id, locale),
        }
      : undefined;
  };

  const cards = items.map((item): CardItem => {
    const { data } = item;
    const relatedIds = [
      ...data.related,
      ...items.filter((o) => o.data.related.includes(item.id)).map((o) => o.id),
      ...items.filter((o) => o.data.app === item.id).map((o) => o.id),
    ];
    const related = [...new Set(relatedIds)]
      .filter((id) => id !== item.id && id !== data.app)
      .map(ref)
      .filter((r): r is CardRef => r !== undefined);
    return {
      id: item.id,
      type: data.type,
      title: data.title,
      summary: data.summary ?? '',
      tags: data.tags,
      stack: itemStackGroups(tech, data.stack, locale),
      stackUses: toStackUses(data.stack),
      topic: data.topic,
      importance: data.importance,
      from: data.from,
      to: data.to,
      dates: formatDates(data.from, data.to, locale),
      companyId: data.company,
      personal: isPersonal(data),
      cert: isCertification(data),
      badge: data.badge,
      companyBadge: data.company ? companyBadge.get(data.company) : undefined,
      context: cardContext(
        data,
        data.company ? companyName.get(data.company) : undefined,
        locale,
      ),
      role: data.role,
      parent: data.app ? ref(data.app) : undefined,
      related,
      links: data.links.map(({ label, url, kind }) => ({ label, url, kind })),
      lang: item.lang,
      fallback: item.fallback,
      bodyHtml: bodies?.get(item.id) ?? '',
      path: itemPath(item.id, locale),
    };
  });
  return cards.sort(compareItems);
}

/** All tags in use, by frequency then alphabetically. */
export function tagsOf(items: readonly Pick<CardItem, 'tags'>[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([tag]) => tag);
}

/** Items carrying `tag` (case-insensitive). */
export function filterByTag<T extends Pick<CardItem, 'tags'>>(
  items: readonly T[],
  tag: string,
): T[] {
  const wanted = tag.toLowerCase();
  return items.filter((item) =>
    item.tags.some((t) => t.toLowerCase() === wanted),
  );
}

/** Map clusters in display order (ui-direction.md). */
export const KNOWN_TOPICS = ['android', 'cloud', 'ai', 'fundamentals'] as const;

export interface TopicGroup<T> {
  /** Topic id (`other` for items without one). */
  readonly topic: string;
  readonly items: T[];
}

/**
 * Groups items by `topic`: the map's clusters first, in their order, then any
 * other topic alphabetically, then items without a topic (`other`).
 * Items keep their relative order.
 */
export function groupByTopic<T extends Pick<CardItem, 'topic'>>(
  items: readonly T[],
): TopicGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const topic = item.topic?.toLowerCase() || 'other';
    groups.set(topic, [...(groups.get(topic) ?? []), item]);
  }
  const rank = (topic: string) => {
    const known = (KNOWN_TOPICS as readonly string[]).indexOf(topic);
    if (known >= 0) return known;
    return topic === 'other' ? Number.MAX_SAFE_INTEGER : KNOWN_TOPICS.length;
  };
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([topic, list]) => ({ topic, items: list }));
}
