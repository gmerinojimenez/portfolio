export interface AiConfig {
  /** The backend's Function URL (S09). */
  readonly url: string;
  /** Public Cloudflare Turnstile site key. */
  readonly siteKey: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The AI is on only when the build knows both where the backend is and the
 * Turnstile site key (both are public values, inlined at build time like
 * `BuildConfig` fields). Without them the console runs in "AI not
 * configured" mode. Plain `http` is accepted only for localhost, to test
 * against a fake server.
 */
export function resolveAiConfig(env: {
  readonly PUBLIC_AI_URL?: string | undefined;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string | undefined;
}): AiConfig | undefined {
  const rawUrl = env.PUBLIC_AI_URL?.trim();
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!rawUrl || !siteKey) return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  const secure = url.protocol === 'https:';
  const local = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return undefined;
  return { url: url.href, siteKey };
}
