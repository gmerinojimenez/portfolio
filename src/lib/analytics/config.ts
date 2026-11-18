/** PostHog Cloud, EU region: ingestion host (data stays in the EU). */
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

export interface AnalyticsConfig {
  readonly key: string;
  readonly host: string;
}

/**
 * Analytics is on only in a production build with a project key. In dev, or
 * when the key isn't set, nothing is loaded and nothing is sent.
 * `PUBLIC_POSTHOG_HOST` exists to point a local build at a fake server when
 * testing; leave it unset in production.
 */
export function resolveConfig(env: {
  readonly PROD?: boolean;
  readonly PUBLIC_POSTHOG_KEY?: string | undefined;
  readonly PUBLIC_POSTHOG_HOST?: string | undefined;
}): AnalyticsConfig | undefined {
  const key = env.PUBLIC_POSTHOG_KEY?.trim();
  if (!env.PROD || !key) return undefined;
  const host = env.PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_EU_HOST;
  return { key, host };
}
