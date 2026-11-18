/** What the visitor typed, split into a command name and its arguments. */
export interface ParsedInput {
  /** The trimmed input, exactly as typed. */
  readonly raw: string;
  /** First word, lower-cased. Empty when the input is empty. */
  readonly name: string;
  /** Remaining words. */
  readonly args: readonly string[];
  /** Everything after the first word, trimmed (useful for free text). */
  readonly argText: string;
}

export function parseInput(input: string): ParsedInput {
  const raw = input.trim();
  const match = /^(\S+)\s*([\s\S]*)$/.exec(raw);
  if (!match) return { raw, name: '', args: [], argText: '' };
  const [, first = '', rest = ''] = match;
  const argText = rest.trim();
  return {
    raw,
    name: first.toLowerCase(),
    args: argText ? argText.split(/\s+/) : [],
    argText,
  };
}
