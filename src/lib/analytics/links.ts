/**
 * What kind of link was clicked. Only the kind is recorded, never the URL,
 * so nothing a visitor follows can leak into analytics.
 */
export type LinkKind =
  'email' | 'github' | 'linkedin' | 'cv' | 'external' | 'internal';

export function classifyLink(
  href: string,
  currentOrigin: string,
): LinkKind | undefined {
  let url: URL;
  try {
    url = new URL(href, currentOrigin);
  } catch {
    return undefined;
  }
  if (url.protocol === 'mailto:') return 'email';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.pathname.toLowerCase().endsWith('.pdf')) return 'cv';
  if (url.origin === currentOrigin) return 'internal';
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'github.com') return 'github';
  if (host === 'linkedin.com') return 'linkedin';
  return 'external';
}
