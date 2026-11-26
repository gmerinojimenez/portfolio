/**
 * Scope gate backed by Jev (TypeSafe AI, ADR 0015): one `systemOne` call with
 * two questions evaluated in parallel, `inScope` (noul) and `language`
 * (choice). The model is pinned: thresholds are tuned against one version.
 */
import {
  APIError,
  APITimeoutError,
  APIUserAbortError,
  TypeSafeClient,
  choice,
  noul,
} from '@typesafe-ai/sdk';
import type { Locale } from '../../lib/locales';
import {
  IN_SCOPE_INSTRUCTIONS,
  LANGUAGE_CRITERIA,
  LANGUAGE_INSTRUCTIONS,
  LANGUAGE_MIN_PROBABILITY,
  gateState,
  verdictFor,
  type ScopeGate,
  type ScopeGateInput,
  type ScopeGateResult,
} from './scope-gate';

export const JEV_MODEL = 'jev-1.14.0';
/** Total budget for the gate, retries included, before failing open. */
export const GATE_TIMEOUT_MS = 1_500;

const questions = {
  inScope: noul(IN_SCOPE_INSTRUCTIONS),
  language: choice(LANGUAGE_INSTRUCTIONS, LANGUAGE_CRITERIA),
};

/** The part of the SDK client the gate uses, so tests can fake it. */
export interface SystemOneClient {
  systemOne: TypeSafeClient['systemOne'];
}

export function createJevClient(apiKey: string): SystemOneClient {
  return new TypeSafeClient({
    apiKey,
    defaultModel: JEV_MODEL,
    // One quick retry at most; the abort signal caps the total time.
    retry: { maxRetries: 1, backoffInitialMs: 100, maxRetryAfterMs: 300 },
    timeout: GATE_TIMEOUT_MS,
    logLevel: 'error',
  });
}

function reasonOf(error: unknown): string {
  if (error instanceof APITimeoutError || error instanceof APIUserAbortError) {
    return 'timeout';
  }
  if (error instanceof APIError) return `http_${error.status ?? 'unknown'}`;
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  return error instanceof Error ? error.name || 'error' : 'error';
}

export class JevScopeGate implements ScopeGate {
  readonly model = JEV_MODEL;

  constructor(
    private readonly client: SystemOneClient,
    private readonly timeoutMs = GATE_TIMEOUT_MS,
    private readonly clock: () => number = Date.now,
  ) {}

  async check({ messages, topics }: ScopeGateInput): Promise<ScopeGateResult> {
    const startedAt = this.clock();
    const elapsed = () => this.clock() - startedAt;
    try {
      const result = await this.client.systemOne(
        {
          model: JEV_MODEL,
          state: { ...gateState(messages, topics) },
          questions,
        },
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
      const inScope = result.answers.inScope.noul;
      if (typeof inScope !== 'number' || !Number.isFinite(inScope)) {
        throw new Error('invalid inScope answer');
      }
      const language = result.answers.language;
      const sure =
        (language?.probabilities?.[language.choice] ?? 0) >=
        LANGUAGE_MIN_PROBABILITY;
      return {
        verdict: verdictFor(inScope),
        inScope,
        ...(sure ? { language: language.choice as Locale } : {}),
        model: result.model || JEV_MODEL,
        inputTokens: result.usage?.input_tokens ?? 0,
        latencyMs: elapsed(),
      };
    } catch (error) {
      return {
        verdict: 'error',
        reason: reasonOf(error),
        model: JEV_MODEL,
        inputTokens: 0,
        latencyMs: elapsed(),
      };
    }
  }
}
