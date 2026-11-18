/**
 * AI backend configuration, resolved from environment variables (pure,
 * tested in ai-config.test.ts).
 *
 *   PORTFOLIO_AI_ENABLED           "true" creates the AI backend. Off by default
 *                                  so deploys work before its secrets are set.
 *   PORTFOLIO_AI_ALLOWED_ORIGINS   comma-separated origins allowed to call the
 *                                  endpoint, e.g. https://xxxx.cloudfront.net.
 *                                  Added to the custom domain's origins.
 *   PORTFOLIO_AI_DAILY_LIMIT_USD   daily spend brake (default 0.5).
 */
import type { PortfolioConfig } from './config';

export interface AiConfig {
  enabled: boolean;
  allowedOrigins: string[];
  dailyLimitUsd: number;
}

export const DEFAULT_AI_DAILY_LIMIT_USD = 0.5;
export const LOCAL_DEV_ORIGIN = 'http://localhost:4321';

type Env = Record<string, string | undefined>;

function parseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `PORTFOLIO_AI_ALLOWED_ORIGINS has an invalid URL: "${value}"`,
    );
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error(`AI origins must use https: "${value}"`);
  }
  // Browsers send the bare origin, without path or trailing slash.
  return url.origin;
}

export function resolveAiConfig(env: Env, config: PortfolioConfig): AiConfig {
  const origins = new Set<string>();
  if (config.domain) {
    for (const host of [config.domain.name, ...config.domain.redirects]) {
      origins.add(`https://${host}`);
    }
  }
  for (const raw of (env.PORTFOLIO_AI_ALLOWED_ORIGINS ?? '').split(',')) {
    if (raw.trim()) origins.add(parseOrigin(raw.trim()));
  }
  // Personal stages are also tried from `astro dev`.
  if (!config.isProduction) origins.add(LOCAL_DEV_ORIGIN);

  const rawLimit = env.PORTFOLIO_AI_DAILY_LIMIT_USD?.trim();
  const dailyLimitUsd = rawLimit
    ? Number(rawLimit)
    : DEFAULT_AI_DAILY_LIMIT_USD;
  if (!Number.isFinite(dailyLimitUsd) || dailyLimitUsd < 0) {
    throw new Error(
      'PORTFOLIO_AI_DAILY_LIMIT_USD must be a non-negative number.',
    );
  }

  return {
    enabled: env.PORTFOLIO_AI_ENABLED?.trim() === 'true',
    allowedOrigins: [...origins],
    dailyLimitUsd,
  };
}
