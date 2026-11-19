/**
 * The career tree's structure (ADR 0015): which node hangs from which, and
 * when each one starts. Built from the console's items and stages, with no
 * positions (`layout.ts` places them). Pure functions only, so Vitest can
 * test them and the browser can rebuild the same model for interaction.
 *
 * - Roots: education. Degrees hang from the ground; certificates are grouped
 *   by the company that issued them.
 * - Trunk: career stages (companies with a `stage`), oldest at the bottom.
 *   A stage's items hang from their app if it's in the same stage, else
 *   from their company when the stage has several, else from the stage.
 * - Personal stem: side projects (`context: personal`).
 * - Anything else (posts) follows its `related` items.
 */
import type { ItemType } from '../../lib/content-schema';
import {
  CLUSTER_ORDER,
  inferCluster,
  type ClusterId,
  type TopicSource,
} from '../../lib/topics';
import type { UiStrings } from '../../i18n/ui';
import type { CardItem } from '../card/model';
import type { StageRef } from '../../lib/stages';

export { CLUSTER_ORDER, type ClusterId };

/** Types in legend order. */
export const TYPE_ORDER: readonly ItemType[] = [
  'app',
  'project',
  'oss',
  'post',
  'education',
];

export type Layout = 'desktop' | 'mobile';

/** What the map needs from a card. */
export type MapItem = Pick<
  CardItem,
  | 'id'
  | 'type'
  | 'title'
  | 'dates'
  | 'path'
  | 'tags'
  | 'topic'
  | 'importance'
  | 'from'
  | 'to'
  | 'context'
  | 'companyId'
  | 'personal'
  | 'cert'
  | 'parent'
  | 'related'
  | 'badge'
  | 'companyBadge'
>;

/**
 * - `item`: a content item (a link to its card).
 * - `stage`: a career stage on the trunk.
 * - `group`: a company inside a stage, or the issuer of several certificates.
 * - `stem`: where the personal stem starts.
 * - `future`: the "next chapter" above "now", only with `?company=` (S11).
 */
export type NodeKind = 'item' | 'stage' | 'group' | 'stem' | 'future';

export type SectionKind = 'stage' | 'stem' | 'roots';

export interface TreeNode {
  readonly id: string;
  readonly kind: NodeKind;
  /** Node it hangs from; `null` for stages, the stem and root nodes. */
  readonly parent: string | null;
  readonly children: readonly string[];
  /** 0 for stages and the stem, 1 for what hangs from them (or the ground). */
  readonly depth: number;
  readonly section: string;
  /** Where it sits in time (decimal year), after spreading shared dates. */
  readonly t: number;
  /** End (decimal year), or `null` for a single point in time. */
  readonly t1: number | null;
  readonly cluster: ClusterId;
  readonly title: string;
  readonly importance: number;
  /** Item nodes only. */
  readonly type?: ItemType;
  /**
   * Monogram for main nodes, drawn as a badge: apps of a stage, company or
   * issuer groups and top-level roots. Undefined for the rest.
   */
  readonly badge?: string;
  /** Future node only: the question it sends to the console. */
  readonly prompt?: string;
}

/** An item as the legend, panel and list see it. */
export interface MapNode {
  readonly id: string;
  readonly type: ItemType;
  readonly cluster: ClusterId;
  readonly importance: number;
  readonly title: string;
  readonly dates: string;
  readonly path: string;
  readonly section: string;
}

export interface MapSection {
  readonly id: string;
  readonly kind: SectionKind;
  readonly title: string;
  /** e.g. `2015 – 2023`; empty for the roots. */
  readonly period: string;
  /** Stages only: 1 for the oldest. */
  readonly ordinal?: number;
  readonly cluster: ClusterId;
  /** Item ids in tab order (newest first). */
  readonly items: readonly string[];
}

/** A `related` connection between two items (shown on focus). */
export interface MapEdge {
  readonly source: string;
  readonly target: string;
}

export interface MapModel {
  /** Every node, items and structure, by id. */
  readonly tree: ReadonlyMap<string, TreeNode>;
  /** Items in tab order: sections in display order, newest first. */
  readonly nodes: readonly MapNode[];
  /** Personal stem, stages (newest first), roots. Only non-empty ones. */
  readonly sections: readonly MapSection[];
  readonly edges: readonly MapEdge[];
  /** "Now" as a decimal year: the latest date in the content. */
  readonly now: number;
}

type Strings = Pick<UiStrings, 'commands' | 'card'>;

export const STAGE_PREFIX = 's:';
export const GROUP_PREFIX = 'g:';
export const STEM_ID = 'p:stem';
export const ROOTS_SECTION = 'roots';
export const STEM_SECTION = 'stem';
export const FUTURE_ID = 'f:future';

/** Extras that depend on the visit, not on the content (S11). */
export interface TreeOptions {
  /** A company from `?company=`: adds the future node. */
  readonly future?: {
    /** e.g. "¿Amazon?". */
    readonly label: string;
    /** e.g. "¿Por qué debería contratar Amazon a Guillermo?". */
    readonly prompt: string;
  };
}

// ---------------------------------------------------------------- dates

/** `2021` → 2021, `2021-04` → 2021.25; with `end`, the end of that period. */
export function parseDate(
  value: string | undefined,
  end = false,
): number | null {
  const m = value?.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  if (!m[2]) return end ? year + 1 : year;
  return year + (Number(m[2]) - 1) / 12 + (end ? 1 / 12 : 0);
}

/** The latest date the content mentions, so the build doesn't depend on the clock. */
export function contentNow(items: readonly Pick<MapItem, 'from' | 'to'>[]) {
  let latest = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const from = parseDate(item.from);
    if (from !== null) latest = Math.max(latest, from + 1 / 12);
    if (item.to && item.to !== 'present') {
      latest = Math.max(latest, parseDate(item.to, true) ?? latest);
    }
  }
  return Number.isFinite(latest) ? round3(latest) : 2000;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function yearSpan(t0: number, t1: number | null, now: number, present: string) {
  const start = Math.floor(t0);
  if (t1 === null) return String(start);
  const end = t1 >= now - 0.01 ? present : String(Math.floor(t1 - 0.001));
  return end === String(start) ? end : `${start} – ${end}`;
}

// ---------------------------------------------------------------- model

const MINOR_WORDS = new Set(
  'app apps de del la el los las en para por con y the of for and an a to on with'.split(
    ' ',
  ),
);

/**
 * Fallback badge letters: the start of the last meaningful word
 * ("App Android de Tuenti" → "Tu"). Items and companies can set `badge`.
 */
export function monogram(title: string): string {
  const words = title
    .split(/[\s·:,()-]+/)
    .filter((w) => w.length > 1 && !MINOR_WORDS.has(w.toLowerCase()));
  const word = words[words.length - 1] ?? title;
  return word.charAt(0).toUpperCase() + word.charAt(1).toLowerCase();
}

interface Draft {
  id: string;
  kind: NodeKind;
  parent: string | null;
  section: string;
  t: number;
  t1: number | null;
  cluster: ClusterId;
  title: string;
  importance: number;
  type?: ItemType;
}

/** Importance-weighted most common cluster; ties go to `CLUSTER_ORDER`. */
function dominant(list: readonly Pick<Draft, 'cluster' | 'importance'>[]) {
  const weight = new Map<ClusterId, number>();
  for (const n of list) {
    weight.set(n.cluster, (weight.get(n.cluster) ?? 0) + n.importance);
  }
  let best: ClusterId = 'fundamentals';
  let top = 0;
  for (const id of CLUSTER_ORDER) {
    if ((weight.get(id) ?? 0) > top) {
      best = id;
      top = weight.get(id) ?? 0;
    }
  }
  return best;
}

/**
 * Children that share their parent's start, or a start with a sibling,
 * usually carry a placeholder date (the company start). They are spread
 * over the parent's period so they don't stack; the most important one
 * keeps its date. The card still shows the real dates.
 */
function spreadDates(parent: Draft, children: Draft[]): void {
  const counts = new Map<number, number>();
  for (const c of children) counts.set(c.t, (counts.get(c.t) ?? 0) + 1);
  const same = children
    .filter(
      (c) =>
        Number.isNaN(c.t) ||
        Math.abs(c.t - parent.t) < 0.01 ||
        (counts.get(c.t) ?? 0) > 1,
    )
    .sort(
      (a, b) =>
        b.importance - a.importance ||
        (b.t1 ?? 0) - (a.t1 ?? 0) ||
        a.id.localeCompare(b.id),
    );
  const [first, ...rest] = same;
  if (first && Number.isNaN(first.t)) first.t = parent.t;
  const span = Math.max(0.6, (parent.t1 ?? parent.t) - parent.t);
  rest.forEach((c, k) => {
    c.t = round3(parent.t + (span * (k + 1)) / (rest.length + 1));
  });
}

/**
 * Stages oldest first: by start, then by end (a short stage that overlaps a
 * longer one goes below it), then by id.
 */
export const byStageOrder = (
  a: { id: string; t: number; t1: number | null },
  b: { id: string; t: number; t1: number | null },
): number =>
  a.t - b.t || (a.t1 ?? a.t) - (b.t1 ?? b.t) || a.id.localeCompare(b.id);

export function buildTreeModel(
  items: readonly MapItem[],
  stages: readonly StageRef[],
  t: Strings,
  options: TreeOptions = {},
): MapModel {
  const now = contentNow(items);
  const strings = t.commands.map;
  const topicById = new Map<string, TopicSource>(
    items.map((i) => [i.id, { ...i, app: i.parent?.id }]),
  );
  const stageOf = new Map<string, string>();
  for (const stage of stages) {
    for (const company of stage.companies) stageOf.set(company, stage.id);
  }

  // Items, and the section each one belongs to.
  const drafts = new Map<string, Draft>();
  for (const item of items) {
    const end =
      item.to === 'present' ? now : (parseDate(item.to, true) ?? null);
    let start = parseDate(item.from) ?? Number.NaN;
    // A year-only post sits mid-year.
    if (item.type === 'post' && /^\d{4}$/.test(item.from ?? '')) start += 0.5;
    const section =
      item.type === 'education'
        ? ROOTS_SECTION
        : item.personal
          ? STEM_SECTION
          : item.companyId && stageOf.has(item.companyId)
            ? STAGE_PREFIX + stageOf.get(item.companyId)
            : '';
    drafts.set(item.id, {
      id: item.id,
      kind: 'item',
      parent: null,
      section,
      t: start,
      t1: end,
      cluster: inferCluster(topicById.get(item.id)!, topicById),
      title: item.title,
      importance: item.importance,
      type: item.type,
    });
  }
  const byItem = new Map(items.map((i) => [i.id, i]));

  // Posts and other loose items follow their related items, in passes, so
  // a post about a post ends up in the right place too.
  let pending = items.filter((i) => drafts.get(i.id)!.section === '');
  for (let progress = true; pending.length > 0 && progress;) {
    progress = false;
    for (const item of pending) {
      const target = item.related
        .map((r) => drafts.get(r.id))
        .find((d) => d && d.section !== '');
      if (!target) continue;
      const draft = drafts.get(item.id)!;
      draft.section = target.section;
      draft.parent = target.id;
      progress = true;
    }
    pending = pending.filter((i) => drafts.get(i.id)!.section === '');
  }

  const itemDrafts = [...drafts.values()];
  const stageIds = [...new Set(stages.map((s) => s.id))];
  const stageDrafts = stageIds.flatMap((id): Draft[] => {
    const members = itemDrafts.filter((d) => d.section === STAGE_PREFIX + id);
    if (members.length === 0) return [];
    const starts = members.map((d) => d.t).filter((v) => !Number.isNaN(v));
    const ends = members
      .map((d) => d.t1 ?? d.t)
      .filter((v) => !Number.isNaN(v));
    const companies = [
      ...new Set(members.flatMap((d) => byItem.get(d.id)?.context ?? [])),
    ];
    const named = (strings.stages as Record<string, string | undefined>)[id];
    return [
      {
        id: STAGE_PREFIX + id,
        kind: 'stage',
        parent: null,
        section: STAGE_PREFIX + id,
        t: starts.length ? Math.min(...starts) : now,
        t1: ends.length ? Math.max(...ends) : null,
        cluster: dominant(members),
        // Unnamed stages are called after their companies.
        title: named ?? (companies.sort().join(' · ') || id),
        importance: 5,
      },
    ];
  });
  // Still loose (nothing related placed): the stage closest in time.
  for (const item of pending) {
    const draft = drafts.get(item.id)!;
    const closest = [...stageDrafts].sort(
      (a, b) =>
        Math.abs(a.t - draft.t) - Math.abs(b.t - draft.t) ||
        a.id.localeCompare(b.id),
    )[0];
    draft.section = closest?.section ?? STEM_SECTION;
  }

  const mine = itemDrafts.filter((d) => d.section === STEM_SECTION);
  const stem: Draft[] = mine.length
    ? [
        {
          id: STEM_ID,
          kind: 'stem',
          parent: null,
          section: STEM_SECTION,
          t: Math.min(
            ...mine.map((d) => d.t).filter((v) => !Number.isNaN(v)),
            now,
          ),
          t1: now,
          cluster: dominant(mine),
          title: strings.personal,
          importance: 5,
        },
      ]
    : [];

  // Parents inside each section.
  const groups = new Map<string, Draft>();
  const groupFor = (section: string, companyId: string, members: Draft[]) => {
    const id = GROUP_PREFIX + companyId;
    let group = groups.get(id);
    if (!group) {
      const ts = members.map((d) => d.t).filter((v) => !Number.isNaN(v));
      group = {
        id,
        kind: 'group',
        parent: section === ROOTS_SECTION ? null : section,
        section,
        t: ts.length ? Math.min(...ts) : now,
        t1: Math.max(
          ...members.map((d) => d.t1 ?? d.t).filter((v) => !Number.isNaN(v)),
          ...ts,
        ),
        cluster: dominant(members),
        title: byItem.get(members[0]!.id)?.context ?? companyId,
        importance: 3,
      };
      groups.set(id, group);
    }
    return group.id;
  };
  const companyMembers = (section: string, companyId: string | undefined) =>
    itemDrafts.filter(
      (d) =>
        d.section === section &&
        d.parent === null &&
        byItem.get(d.id)?.companyId === companyId,
    );

  for (const stage of stageDrafts) {
    const members = itemDrafts.filter((d) => d.section === stage.id);
    const companies = new Set(
      members.flatMap((d) => byItem.get(d.id)?.companyId ?? []),
    );
    for (const draft of members) {
      if (draft.parent !== null) continue; // a post placed by `related`
      const item = byItem.get(draft.id)!;
      const app = item.parent ? drafts.get(item.parent.id) : undefined;
      if (app && app.section === stage.id) draft.parent = app.id;
      else if (companies.size > 1 && item.companyId) {
        draft.parent = groupFor(
          stage.id,
          item.companyId,
          companyMembers(stage.id, item.companyId),
        );
      } else draft.parent = stage.id;
    }
  }
  for (const draft of mine) {
    if (draft.parent !== null) continue;
    const app = byItem.get(draft.id)?.parent;
    draft.parent =
      app && drafts.get(app.id)?.section === STEM_SECTION ? app.id : STEM_ID;
  }
  for (const draft of itemDrafts.filter((d) => d.section === ROOTS_SECTION)) {
    if (draft.parent !== null) continue;
    const item = byItem.get(draft.id)!;
    if (!item.cert || !item.companyId) continue;
    const certs = itemDrafts.filter(
      (d) =>
        d.section === ROOTS_SECTION &&
        byItem.get(d.id)?.cert &&
        byItem.get(d.id)?.companyId === item.companyId,
    );
    // Under their issuer, even a single one: the root shows who issued it.
    draft.parent = groupFor(ROOTS_SECTION, item.companyId, certs);
  }

  // Break any cycle (`app` pointing at each other) at the section anchor.
  const all = new Map<string, Draft>(
    [...stageDrafts, ...stem, ...groups.values(), ...itemDrafts].map((d) => [
      d.id,
      d,
    ]),
  );
  const anchorOf = (d: Draft) =>
    d.section === ROOTS_SECTION
      ? null
      : d.section === STEM_SECTION
        ? STEM_ID
        : d.section;
  for (const draft of itemDrafts) {
    const seen = new Set([draft.id]);
    for (let p = draft.parent; p !== null; p = all.get(p)?.parent ?? null) {
      if (seen.has(p) || !all.has(p)) {
        draft.parent = anchorOf(draft);
        break;
      }
      seen.add(p);
    }
  }

  // Children, then spread shared dates from the top of the tree down.
  const children = new Map<string, Draft[]>();
  for (const d of all.values()) {
    if (d.parent === null) continue;
    children.set(d.parent, [...(children.get(d.parent) ?? []), d]);
  }
  const order = [...all.values()]
    .filter((d) => d.parent === null)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < order.length; i++) {
    const node = order[i]!;
    const kids = (children.get(node.id) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (node.section !== ROOTS_SECTION || node.kind === 'group') {
      spreadDates(node, kids);
    }
    order.push(...kids);
  }
  for (const d of all.values()) if (Number.isNaN(d.t)) d.t = now;

  const depthOf = (d: Draft): number => {
    if (d.parent === null)
      return d.kind === 'stage' || d.kind === 'stem' ? 0 : 1;
    const parent = all.get(d.parent);
    return parent ? depthOf(parent) + 1 : 1;
  };
  const badgeOf = (d: Draft): string | undefined => {
    if (d.kind === 'group') {
      const first = itemDrafts.find((i) => i.parent === d.id);
      return (first && byItem.get(first.id)?.companyBadge) ?? monogram(d.title);
    }
    if (d.kind !== 'item') return undefined;
    const item = byItem.get(d.id)!;
    const parent = d.parent === null ? undefined : all.get(d.parent);
    if (d.section === ROOTS_SECTION && d.parent === null) {
      return item.badge ?? item.companyBadge ?? monogram(item.title);
    }
    if (parent?.kind === 'stage' && item.type === 'app') {
      return item.badge ?? monogram(item.title);
    }
    return undefined;
  };
  const tree = new Map<string, TreeNode>();
  for (const d of order) {
    const badge = badgeOf(d);
    tree.set(d.id, {
      ...d,
      children: (children.get(d.id) ?? []).map((c) => c.id),
      depth: depthOf(d),
      ...(badge ? { badge } : {}),
    });
  }
  // The next chapter: above the newest stage, outside every section, so it
  // never changes how the rest of the tree is built.
  const latest = [...stageDrafts].sort(byStageOrder).at(-1);
  if (options.future && latest) {
    tree.set(FUTURE_ID, {
      id: FUTURE_ID,
      kind: 'future',
      parent: null,
      children: [],
      depth: 0,
      section: '',
      t: now,
      t1: null,
      cluster: latest.cluster,
      title: options.future.label,
      importance: 5,
      prompt: options.future.prompt,
    });
  }

  // Sections in display order, items newest first.
  const present = t.card.present;
  const itemsIn = (section: string) =>
    itemDrafts
      .filter((d) => d.section === section)
      .sort((a, b) => b.t - a.t || a.id.localeCompare(b.id))
      .map((d) => d.id);
  const ordinals = new Map(
    [...stageDrafts].sort(byStageOrder).map((s, k) => [s.id, k + 1]),
  );
  const sections: MapSection[] = [
    ...stem.map((s) => ({
      id: STEM_SECTION,
      kind: 'stem' as const,
      title: s.title,
      period: yearSpan(s.t, s.t1, now, present),
      cluster: s.cluster,
      items: itemsIn(STEM_SECTION),
    })),
    ...[...stageDrafts]
      .sort((a, b) => byStageOrder(b, a))
      .map((s) => ({
        id: s.id,
        kind: 'stage' as const,
        title: s.title,
        period: yearSpan(s.t, s.t1, now, present),
        ordinal: ordinals.get(s.id),
        cluster: s.cluster,
        items: itemsIn(s.id),
      })),
  ];
  const roots = itemsIn(ROOTS_SECTION);
  if (roots.length > 0) {
    sections.push({
      id: ROOTS_SECTION,
      kind: 'roots',
      title: strings.roots,
      period: '',
      cluster: 'fundamentals',
      items: roots,
    });
  }

  const nodes = sections.flatMap((section) =>
    section.items.map((id): MapNode => {
      const item = byItem.get(id)!;
      return {
        id,
        type: item.type,
        cluster: drafts.get(id)!.cluster,
        importance: item.importance,
        title: item.title,
        dates: item.dates,
        path: item.path,
        section: section.id,
      };
    }),
  );

  // Related connections that aren't already a branch.
  const seen = new Set<string>();
  const edges: MapEdge[] = [];
  for (const item of items) {
    for (const ref of item.related) {
      if (!drafts.has(ref.id) || ref.id === item.id) continue;
      const [source, target] = [item.id, ref.id].sort() as [string, string];
      const key = `${source}|${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (
        tree.get(source)?.parent === target ||
        tree.get(target)?.parent === source
      ) {
        continue;
      }
      edges.push({ source, target });
    }
  }
  edges.sort(
    (a, b) =>
      a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
  );

  return { tree, nodes, sections, edges, now };
}

/**
 * Whether an item keeps its label visible at rest: apps and owned projects
 * (importance ≥ 4) on desktop, only the most important ones on mobile.
 */
export function labeledAtRest(
  node: Pick<MapNode, 'type' | 'importance'>,
  layout: Layout,
): boolean {
  if (layout === 'mobile') return node.importance >= 5;
  return node.type === 'app' || node.importance >= 4;
}

/** How many nodes there are of each value of `key` (for legend counts). */
export function countBy<K extends 'type' | 'cluster'>(
  nodes: readonly MapNode[],
  key: K,
): Map<MapNode[K], number> {
  const counts = new Map<MapNode[K], number>();
  for (const node of nodes) {
    counts.set(node[key], (counts.get(node[key]) ?? 0) + 1);
  }
  return counts;
}

/** Clusters used by at least one item, in `CLUSTER_ORDER`. */
export function usedClusters(nodes: readonly MapNode[]): ClusterId[] {
  const used = new Set(nodes.map((n) => n.cluster));
  return CLUSTER_ORDER.filter((id) => used.has(id));
}
