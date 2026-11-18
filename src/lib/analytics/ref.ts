/**
 * `?ref=` identifies the application a visitor came from (e.g. a company).
 * It's untrusted input from a URL, so it is validated against a short
 * allowlist before it goes anywhere: lowercase letters, digits, `-` and `_`,
 * at most 32 characters. Anything else is dropped, not "cleaned", so a
 * malformed value never turns into a different valid one.
 */
export const REF_PARAM = 'ref';

const REF_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export function sanitizeRef(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  return REF_PATTERN.test(value) ? value : undefined;
}

export interface RefCapture {
  /** The sanitized ref, if the URL had a valid one. */
  readonly ref: string | undefined;
  /** The URL without `ref` as `path?query#hash`; `undefined` if it had none. */
  readonly cleanUrl: string | undefined;
}

/** Reads `?ref=` from a URL and computes the URL without it. */
export function captureRef(href: string): RefCapture {
  const url = new URL(href);
  if (!url.searchParams.has(REF_PARAM)) {
    return { ref: undefined, cleanUrl: undefined };
  }
  const ref = sanitizeRef(url.searchParams.get(REF_PARAM));
  url.searchParams.delete(REF_PARAM);
  return { ref, cleanUrl: `${url.pathname}${url.search}${url.hash}` };
}
