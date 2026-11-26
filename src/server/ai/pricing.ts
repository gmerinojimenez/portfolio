/**
 * Model choice and prices. The only place to update when Anthropic changes
 * prices (see ADR 0013). Amounts are integer micro-dollars (1 µUSD =
 * 0.000001 USD) so the spend brake never accumulates floating-point error.
 */

export const MODEL = 'claude-haiku-5-5';

/** USD per million tokens. */
export interface Prices {
  input: number;
  output: number;
  cacheRead: number;
  /** 5-minute cache writes cost 1.25x the input price. */
  cacheWrite: number;
}

/** Claude Haiku 5.5, prompts up to 100K input tokens. */
export const HAIKU_PRICES: Prices = {
  input: 0.1,
  output: 0.5,
  cacheRead: 0.01,
  cacheWrite: 0.125,
};

/** Above this many input tokens the long-context price applies (x5). */
export const LONG_CONTEXT_THRESHOLD = 100_000;
export const LONG_CONTEXT_MULTIPLIER = 5;

export interface TokenUsage {
  /** Uncached input tokens. */
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export const emptyUsage = (): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
});

export function totalInputTokens(usage: TokenUsage): number {
  return (
    usage.inputTokens +
    usage.cacheReadInputTokens +
    usage.cacheCreationInputTokens
  );
}

/**
 * Real cost of a call from its `usage`, rounded up to a whole micro-dollar.
 * tokens x (USD / 1M tokens) is already micro-dollars.
 */
export function costMicroUsd(
  usage: TokenUsage,
  prices: Prices = HAIKU_PRICES,
): number {
  const multiplier =
    totalInputTokens(usage) > LONG_CONTEXT_THRESHOLD
      ? LONG_CONTEXT_MULTIPLIER
      : 1;
  const raw =
    multiplier *
    (usage.inputTokens * prices.input +
      usage.cacheReadInputTokens * prices.cacheRead +
      usage.cacheCreationInputTokens * prices.cacheWrite +
      usage.outputTokens * prices.output);
  // Guard against 0.30000000000000004-style noise before rounding up.
  return Math.ceil(Number(raw.toFixed(6)));
}

/** Conservative token estimate for text we have not sent yet (~3 chars/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Worst-case cost of a call, reserved by the spend brake before calling:
 * every input token billed as a cache write (the most expensive input rate)
 * and the full `max_tokens` of output.
 */
export function maxCostMicroUsd(
  estimatedInputTokens: number,
  maxOutputTokens: number,
  prices: Prices = HAIKU_PRICES,
): number {
  return costMicroUsd(
    {
      inputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: estimatedInputTokens,
      outputTokens: maxOutputTokens,
    },
    prices,
  );
}

/**
 * Jev (TypeSafe AI, scope gate of S17): USD per million input tokens, from
 * docs.typesafe.ai/models (2026-11-26). Output tokens are free.
 */
export const JEV_INPUT_PRICE = 0.042;

/** Real cost of a gate call, rounded up to a whole micro-dollar. */
export const jevCostMicroUsd = (inputTokens: number): number =>
  Math.ceil(Number((inputTokens * JEV_INPUT_PRICE).toFixed(6)));

export const microUsdToUsd = (micro: number): number => micro / 1_000_000;
export const usdToMicroUsd = (usd: number): number =>
  Math.round(usd * 1_000_000);
