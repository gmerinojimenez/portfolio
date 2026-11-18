/**
 * Cloudflare Turnstile server-side check. Tokens are single use, so the
 * console must fetch a new one for every question.
 */

export const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerifier = (token: string) => Promise<boolean>;

type FetchLike = (
  url: string,
  init: { method: string; body: URLSearchParams; signal?: AbortSignal },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
}

/**
 * Builds a verifier bound to a secret and the hostnames the widget may run on.
 * The visitor's IP is not sent (not required, and keeps less data flowing).
 * Network or Cloudflare errors count as a failed check (fail closed).
 */
export function createTurnstileVerifier(
  secret: string,
  allowedHostnames: string[],
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): TurnstileVerifier {
  return async (token) => {
    if (!token || token.length > 2048) return false;
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as SiteverifyResponse;
      if (data.success !== true) return false;
      return (
        allowedHostnames.length === 0 ||
        (typeof data.hostname === 'string' &&
          allowedHostnames.includes(data.hostname))
      );
    } catch {
      return false;
    }
  };
}
