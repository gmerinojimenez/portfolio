import { renderedBodies } from '../card/body';
import { toCardItems, toStackItems, type CardItem } from '../card/model';
import { getCompanies, getItems } from '../../lib/content';
import type { Locale } from '../../lib/locales';
import { stagesOf, type StageRef } from '../../lib/stages';
import { summarizeStacks, type StackSummary } from '../../lib/tech';
import { techCatalog } from '../../lib/tech-catalog';
import { profiles } from './profile';
import { CV_TRACKS, type CvTrack } from '../../lib/cv';
import { cvConfig } from '../../lib/cv-config';

/**
 * Everything the console needs from the content layer, already localized.
 *
 * This is the only seam between the console and the content: commands read
 * `ctx.data`, never `astro:content`. `getConsoleData` is called at build
 * time and the result is embedded in the page as JSON, so it must stay
 * serializable (no functions, no Dates).
 */
export type { StageRef };

export interface ConsoleData extends SiteProfile {
  /** Published items (drafts too in `astro dev`), sorted for `ls`. */
  readonly items: readonly CardItem[];
  /** Career stages (companies with a `stage`), for the map's trunk. */
  readonly stages: readonly StageRef[];
  /** Technologies by stack with the items that use them (S15). */
  readonly stacks: readonly StackSummary[];
  /** Headline and intro of each `?track=` (S16), from `cv.yaml`. */
  readonly tracks: Readonly<Record<CvTrack, Profile>>;
}

/** Hand-written data about the author (see `profile.ts`). */
export interface SiteProfile {
  readonly profile: Profile;
  readonly contact: Contact;
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
export function getConsoleData(locale: Locale): Promise<ConsoleData> {
  // Every page embeds the same data: build it once per language (only in
  // `astro build`, so the dev server picks up content edits).
  if (import.meta.env.DEV) return loadConsoleData(locale);
  let data = cache.get(locale);
  if (!data) {
    data = loadConsoleData(locale);
    cache.set(locale, data);
  }
  return data;
}

const cache = new Map<Locale, Promise<ConsoleData>>();

async function loadConsoleData(locale: Locale): Promise<ConsoleData> {
  const [items, companies] = await Promise.all([
    getItems(locale),
    getCompanies(),
  ]);
  const bodies = await renderedBodies(items);
  const cards = toCardItems({
    items,
    companies,
    locale,
    bodies,
    tech: techCatalog,
  });
  return {
    ...profiles[locale],
    items: cards,
    stages: stagesOf(companies),
    stacks: summarizeStacks(techCatalog, toStackItems(cards), locale),
    tracks: tracksOf(profiles[locale].profile, locale),
  };
}

/** The profile as a visit with `?track=` sees it: the lens title and intro. */
function tracksOf(profile: Profile, locale: Locale): Record<CvTrack, Profile> {
  const entries = CV_TRACKS.map((track): [CvTrack, Profile] => {
    const lens = cvConfig[track];
    return [
      track,
      {
        name: profile.name,
        headline: lens.title?.[locale] ?? profile.headline,
        intro: lens.intro?.[locale] ?? profile.intro,
      },
    ];
  });
  return Object.fromEntries(entries) as Record<CvTrack, Profile>;
}
