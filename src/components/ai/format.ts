import type { Locale } from '../../lib/locales';
import type { UiStrings } from '../../i18n/ui';
import type { WireUsage } from './protocol';

/** Replaces `{name}` placeholders in a UI string. */
export function fill(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : value;
  });
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Costs are fractions of a cent: four decimals, `$0.0004`. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(usd >= 0.01 ? 3 : 4)}`;
}

export interface Transparency {
  readonly model: string;
  readonly usage: WireUsage;
  readonly costUsd: number;
  readonly latencyMs: number;
}

/**
 * The faint line under each answer: model, tokens in and out, how much of
 * the input came from the cache, cost and latency (ai-features.md,
 * transparency). Everything the visitor needs to see what an answer costs.
 */
export function transparencyLine(
  info: Transparency,
  locale: Locale,
  t: UiStrings['ai'],
): string {
  const number = new Intl.NumberFormat(locale);
  const { usage } = info;
  const input =
    usage.inputTokens +
    usage.cacheReadInputTokens +
    usage.cacheCreationInputTokens;
  const parts = [
    info.model,
    fill(t.tokensIn, { n: number.format(input) }),
    fill(t.tokensOut, { n: number.format(usage.outputTokens) }),
  ];
  if (usage.cacheReadInputTokens > 0) {
    parts.push(
      fill(t.cached, { n: number.format(usage.cacheReadInputTokens) }),
    );
  }
  parts.push(formatCost(info.costUsd), formatLatency(info.latencyMs));
  return parts.filter(Boolean).join(' · ');
}
