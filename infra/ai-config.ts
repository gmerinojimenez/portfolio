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
 *   PORTFOLIO_AI_SCOPE_GATE        scope gate (S17): off (default), shadow or
 *                                  enforce. shadow and enforce need the
 *                                  TypeSafeApiKey secret.
 *   PORTFOLIO_AI_ORCHESTRATOR      who chains the chat's AI steps (S18):
 *                                  direct (default) or langgraph.
 *   PORTFOLIO_AI_TRACING           "true" traces the graph in LangSmith (EU).
 *                                  Needs langgraph and the LangSmithApiKey
 *                                  secret.
 */
import type { PortfolioConfig } from './config';

/** Same values as ScopeGateMode in src/server/ai/scope-gate.ts. */
export type ScopeGateMode = 'off' | 'shadow' | 'enforce';
const SCOPE_GATE_MODES: readonly ScopeGateMode[] = ['off', 'shadow', 'enforce'];

/** Same values as OrchestratorName in src/server/ai/chat-orchestrator.ts. */
export type Orchestrator = 'direct' | 'langgraph';
const ORCHESTRATORS: readonly Orchestrator[] = ['direct', 'langgraph'];

export interface AiConfig {
  enabled: boolean;
  allowedOrigins: string[];
  dailyLimitUsd: number;
  scopeGate: ScopeGateMode;
  orchestrator: Orchestrator;
  tracing: boolean;
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

  const rawGate = env.PORTFOLIO_AI_SCOPE_GATE?.trim() || 'off';
  if (!SCOPE_GATE_MODES.includes(rawGate as ScopeGateMode)) {
    throw new Error(
      `PORTFOLIO_AI_SCOPE_GATE must be one of ${SCOPE_GATE_MODES.join(', ')}: "${rawGate}"`,
    );
  }

  const rawOrchestrator = env.PORTFOLIO_AI_ORCHESTRATOR?.trim() || 'direct';
  if (!ORCHESTRATORS.includes(rawOrchestrator as Orchestrator)) {
    throw new Error(
      `PORTFOLIO_AI_ORCHESTRATOR must be one of ${ORCHESTRATORS.join(', ')}: "${rawOrchestrator}"`,
    );
  }
  const rawTracing = env.PORTFOLIO_AI_TRACING?.trim() || 'false';
  if (rawTracing !== 'true' && rawTracing !== 'false') {
    throw new Error(
      `PORTFOLIO_AI_TRACING must be true or false: "${rawTracing}"`,
    );
  }
  const tracing = rawTracing === 'true';
  if (tracing && rawOrchestrator !== 'langgraph') {
    throw new Error(
      'PORTFOLIO_AI_TRACING=true needs PORTFOLIO_AI_ORCHESTRATOR=langgraph: only the graph is traced.',
    );
  }

  return {
    enabled: env.PORTFOLIO_AI_ENABLED?.trim() === 'true',
    allowedOrigins: [...origins],
    dailyLimitUsd,
    scopeGate: rawGate as ScopeGateMode,
    orchestrator: rawOrchestrator as Orchestrator,
    tracing,
  };
}

/** The scope gate's secret, created only when the gate runs (S17). */
export function scopeGateLinks<T>(config: AiConfig, secret: () => T): T[] {
  return config.scopeGate === 'off' ? [] : [secret()];
}

/** LangSmith's secret, created only when tracing is on (S18). */
export function tracingLinks<T>(config: AiConfig, secret: () => T): T[] {
  return config.tracing ? [secret()] : [];
}
