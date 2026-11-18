import type { CommandRegistry } from './registry';
import type { CommandContext } from './types';

export interface CompletionResult {
  /** New input value (unchanged when there is nothing to complete). */
  readonly value: string;
  /** Matching candidates; more than one means the visitor must choose. */
  readonly candidates: readonly string[];
}

/**
 * Tab completion. The first word completes against command names in the
 * current language; later words ask the command's `complete` hook.
 * A unique match is completed and followed by a space; several matches are
 * completed up to their longest common prefix and returned as candidates.
 */
export function complete(
  input: string,
  registry: CommandRegistry,
  ctx: CommandContext,
): CompletionResult {
  const leading = /^\s*/.exec(input)?.[0] ?? '';
  const text = input.slice(leading.length);
  const words = text.split(/\s+/);

  if (words.length <= 1) {
    const word = words[0] ?? '';
    if (!word) return { value: input, candidates: [] };
    const options = registry.completionNames(ctx.locale);
    return apply(input, leading, word, options);
  }

  const command = registry.resolve(words[0] ?? '');
  if (!command?.complete) return { value: input, candidates: [] };
  const current = words[words.length - 1] ?? '';
  const args = words.slice(1, -1);
  const options = command.complete({ args, current }, ctx);
  const before = input.slice(0, input.length - current.length);
  return apply(input, before, current, options);
}

function apply(
  input: string,
  before: string,
  word: string,
  options: readonly string[],
): CompletionResult {
  const lower = word.toLowerCase();
  const matches = [...new Set(options)].filter((o) =>
    o.toLowerCase().startsWith(lower),
  );
  const [only] = matches;
  if (matches.length === 0 || only === undefined) {
    return { value: input, candidates: [] };
  }
  if (matches.length === 1) {
    return { value: `${before}${only} `, candidates: matches };
  }
  const prefix = commonPrefix(matches);
  const value = prefix.length > word.length ? `${before}${prefix}` : input;
  return { value, candidates: matches };
}

export function commonPrefix(values: readonly string[]): string {
  const [first = '', ...rest] = values;
  let end = first.length;
  for (const value of rest) {
    let i = 0;
    while (
      i < end &&
      i < value.length &&
      value[i]?.toLowerCase() === first[i]?.toLowerCase()
    ) {
      i += 1;
    }
    end = i;
  }
  return first.slice(0, end);
}
