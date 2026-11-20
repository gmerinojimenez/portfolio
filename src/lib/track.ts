/**
 * `?track=` (S16): the profile a personalised link was made for, `ai` or
 * `android`, e.g. `/es/?company=Amazon&track=ai`. Untrusted input from a URL,
 * so only the known values pass; anything else is dropped whole, like
 * `?ref=` and `?company=`.
 *
 * It stays in the URL (reload and share keep it) and follows a language
 * switch, so the visit keeps its profile: headline, intro and which CV the
 * `cv` command opens.
 */
import { CV_TRACKS, type CvTrack } from './cv';

export const TRACK_PARAM = 'track';

export function sanitizeTrack(
  raw: string | null | undefined,
): CvTrack | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim().toLowerCase();
  return CV_TRACKS.find((track) => track === value);
}

/** The validated track of a query string (`location.search`), if any. */
export function readTrack(search: string): CvTrack | undefined {
  try {
    return sanitizeTrack(new URLSearchParams(search).get(TRACK_PARAM));
  } catch {
    return undefined;
  }
}

/** `path` with `?track=` set; without a track, `path` untouched. */
export function withTrack(path: string, track: CvTrack | undefined): string {
  if (!track) return path;
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set(TRACK_PARAM, track);
  return `${url.pathname}${url.search}${url.hash}`;
}
