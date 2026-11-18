import type { Locale } from '../../lib/locales';
import { sampleData } from './sample-data';

/**
 * Everything the console needs from the content layer, already localized.
 *
 * This is the only seam between the console and the content. Today it reads
 * hand-written sample data; when S01 lands, reimplement `getConsoleData` on
 * top of the content collections and nothing else has to change.
 *
 * It is called at build time (in `Console.astro`) and the result is embedded
 * in the page as JSON, so it must stay serializable (no functions, no Dates).
 */
export interface ConsoleData {
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

export async function getConsoleData(locale: Locale): Promise<ConsoleData> {
  return sampleData[locale];
}
