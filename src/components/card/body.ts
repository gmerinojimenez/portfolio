/**
 * Rendered HTML of an item's Markdown body (build time only).
 *
 * `src/lib/content.ts` exposes the raw Markdown (`item.body`) but not the HTML
 * that Astro already rendered for each collection entry, so this reads it
 * straight from the collection. If the access layer ever exposes it
 * (e.g. `item.html`), this file can go.
 */
import { getEntry } from 'astro:content';
import type { Localized } from '../../lib/content-core';

export async function renderedBody(
  item: Pick<Localized<unknown>, 'id' | 'lang' | 'fixture'>,
): Promise<string> {
  const path = `${item.fixture ? 'fixtures/' : ''}items/${item.lang}/${item.id}`;
  const entry = await getEntry('items', path);
  return entry?.rendered?.html ?? '';
}

export async function renderedBodies(
  items: readonly Pick<Localized<unknown>, 'id' | 'lang' | 'fixture'>[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    items.map(async (item) => [item.id, await renderedBody(item)] as const),
  );
  return new Map(entries);
}
