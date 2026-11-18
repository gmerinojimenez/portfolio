import { renderedBodies } from '../card/body';
import { toCardItems, type CardItem } from '../card/model';
import { getCompanies, getItems } from '../../lib/content';
import type { Locale } from '../../lib/locales';
import { profiles } from './profile';

/**
 * Everything the console needs from the content layer, already localized.
 *
 * This is the only seam between the console and the content: commands read
 * `ctx.data`, never `astro:content`. `getConsoleData` is called at build time and the result is embedded in the page as JSON, so it
 * must stay serializable (no functions, no Dates).
 */
export interface ConsoleData extends SiteProfile {
  /** Published items (drafts too in `astro dev`), sorted for `ls`. */
  readonly items: readonly CardItem[];
}

/** Hand-written data about the author (see `profile.ts`). */
export interface SiteProfile {
  readonly profile: Profile;
  readonly contact: Contact;
  /** `null` while the PDF isn't published. */
  readonly cv: { readonly url: string; readonly filename: string } | null;
}

export interface Profile {
  readonly name: string;
  /** "Software engineer · Android · Full stack · Applied AI" */
  readonly headline: string;
  /** Two short sentences shown under the headline. */
  readonly intro: readonly string[];
}

export interface Contact {
  readonly email: string;
  readonly links: readonly ContactLink[];
}

export interface ContactLink {
  /** Short label, e.g. `linkedin`. */
  readonly label: string;
  readonly href: string;
  /** Visible text, e.g. `linkedin.com/in/someone`. */
  readonly text: string;
}

/**
 * Build time only: reads the content layer (S01) and the profile. Browser
 * code must import this module with `import type` only, so `astro:content`
 * never ends up in the client bundle.
 */
export async function getConsoleData(locale: Locale): Promise<ConsoleData> {
  const [items, companies] = await Promise.all([
    getItems(locale),
    getCompanies(),
  ]);
  const bodies = await renderedBodies(items);
  return {
    ...profiles[locale],
    items: toCardItems({ items, companies, locale, bodies }),
  };
}
