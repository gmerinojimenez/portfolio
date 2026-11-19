/**
 * `?company=` (S11): the company a personalised link was made for, e.g.
 * `/es/?company=Amazon`. Whoever shares the link writes it, so it is
 * untrusted input, like the data of an Android deep link: it is validated
 * before anything uses it, and a value that fails is dropped whole, never
 * "cleaned" into a different valid one (same rule as `?ref=`).
 *
 * Accepted: letters of any language, digits, spaces and `& . , ' -`, 1 to 30
 * characters after trimming and collapsing runs of spaces, with at least one
 * letter or digit. Things that look like a domain (`evil.com`) are rejected,
 * so a link can't pass a URL off as a company name. The value is only ever
 * rendered as text (`textContent` / escaped markup), never as HTML.
 *
 * Pure: used by the browser (map, console, analytics) and by the AI backend,
 * which validates the `company` field of offer requests again.
 */
export const COMPANY_PARAM = 'company';
export const MAX_COMPANY_CHARS = 30;

const ALLOWED = /^[\p{L}\p{M}\p{N} &.,'-]+$/u;
const HAS_WORD = /[\p{L}\p{N}]/u;
/** A dot followed by two or more letters: `amazon.com`, `www.x`. */
const DOMAIN_LIKE = /\.\p{L}{2,}/u;

export function sanitizeCompany(
  raw: string | null | undefined,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.normalize('NFC').trim().replace(/ {2,}/g, ' ');
  if (value.length === 0 || value.length > MAX_COMPANY_CHARS) return undefined;
  if (!ALLOWED.test(value) || !HAS_WORD.test(value)) return undefined;
  if (DOMAIN_LIKE.test(value)) return undefined;
  return value;
}

/** The validated company of a query string (`location.search`), if any. */
export function readCompany(search: string): string | undefined {
  try {
    return sanitizeCompany(new URLSearchParams(search).get(COMPANY_PARAM));
  } catch {
    return undefined;
  }
}

/**
 * `path` with `?company=` set, so a language switch keeps the node.
 * Without a company, `path` is returned untouched.
 */
export function withCompany(path: string, company: string | undefined): string {
  if (!company) return path;
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set(COMPANY_PARAM, company);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The company as analytics records it: lowercase, so "Amazon" = "amazon". */
export const companyProperty = (company: string): string =>
  company.toLocaleLowerCase('en');
