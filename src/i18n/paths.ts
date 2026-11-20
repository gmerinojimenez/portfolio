import { CV_SLUGS, trackFromSlug } from '../lib/cv';
import { isLocale, locales, type Locale } from '../lib/locales';

/**
 * Site sections whose URL segment is translated. Item ids (slugs) are the
 * same in both languages (ADR 0010); only these section names change, so
 * `/es/proyectos/x/` ↔ `/en/projects/x/`.
 */
export const sections = {
  items: { es: 'proyectos', en: 'projects' },
  reading: { es: 'lectura', en: 'reading' },
  privacy: { es: 'privacidad', en: 'privacy' },
  notes: { es: 'notas', en: 'notes' },
  cv: { es: 'cv', en: 'cv' },
} as const satisfies Record<string, Record<Locale, string>>;

export type Section = keyof typeof sections;

/** Path of the home page for a language, e.g. `/en/`. */
export function localeHome(locale: Locale): string {
  return `/${locale}/`;
}

/** Path of a section page, e.g. `/en/reading/`. */
export function sectionPath(section: Section, locale: Locale): string {
  return `/${locale}/${sections[section][locale]}/`;
}

/** Path of an item's own page, e.g. `/es/proyectos/my-app/`. */
export function itemPath(id: string, locale: Locale): string {
  return `${sectionPath('items', locale)}${id}/`;
}

/** Language of a path, from its first segment (`/en/…` → `en`). */
export function localeFromPath(pathname: string): Locale | undefined {
  const first = pathname.split('/')[1] ?? '';
  return isLocale(first) ? first : undefined;
}

/** Item id of an item page path (`/en/projects/x/` → `x`), else undefined. */
export function itemIdFromPath(pathname: string): string | undefined {
  const [, locale = '', section, id, ...rest] = pathname.split('/');
  if (!isLocale(locale) || section !== sections.items[locale]) return undefined;
  if (!id || rest.some((segment) => segment !== '')) return undefined;
  return decodeURIComponent(id);
}

/**
 * Same page in another language: `/es/proyectos/x/` → `/en/projects/x/`.
 * The language prefix changes and so does a translated section segment.
 */
export function switchLocalePath(pathname: string, target: Locale): string {
  const segments = pathname.split('/');
  const from = localeFromPath(pathname);
  if (!from) {
    const rest = pathname.replace(/^\/+/, '');
    return `/${target}/${rest}`;
  }
  segments[1] = target;
  const section = segments[2];
  // CV lenses have their own slug per language: /es/cv/ia/ ↔ /en/cv/ai/.
  const lens =
    section === sections.cv[from]
      ? trackFromSlug(segments[3] ?? '', from)
      : undefined;
  if (lens) segments[3] = CV_SLUGS[lens][target];
  for (const names of Object.values(sections)) {
    if (locales.some((l) => names[l] === section)) {
      segments[2] = names[target];
      break;
    }
  }
  return segments.join('/');
}
