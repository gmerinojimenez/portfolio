import { isLocale, type Locale } from '../lib/locales';

/** Path of the home page for a language, e.g. `/en/`. */
export function localeHome(locale: Locale): string {
  return `/${locale}/`;
}

/** Language of a path, from its first segment (`/en/…` → `en`). */
export function localeFromPath(pathname: string): Locale | undefined {
  const first = pathname.split('/')[1] ?? '';
  return isLocale(first) ? first : undefined;
}

/**
 * Same page in another language: `/es/proyectos/x` → `/en/proyectos/x`.
 * Ids (slugs) are shared between languages, so only the prefix changes.
 */
export function switchLocalePath(pathname: string, target: Locale): string {
  const segments = pathname.split('/');
  if (localeFromPath(pathname)) {
    segments[1] = target;
    return segments.join('/');
  }
  const rest = pathname.replace(/^\/+/, '');
  return `/${target}/${rest}`;
}
