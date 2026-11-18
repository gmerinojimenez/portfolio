/**
 * Tiny, dependency-free HTML templating for console output.
 *
 * Commands build their output with the `markup` tagged template. Every
 * interpolated value is escaped unless it is already `Html` (another `markup`
 * template, or something explicitly wrapped in `raw`). Output is plain text
 * underneath, so the same command can render at build time (static HTML)
 * and in the browser (innerHTML).
 */

/** A fragment of HTML that is known to be safe. */
export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export type Interpolation =
  | Html
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Interpolation[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Marks a string as trusted HTML. Never use it with user input. */
export function raw(value: string): Html {
  return new Html(value);
}

function render(value: Interpolation): string {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

export function markup(
  strings: TemplateStringsArray,
  ...values: Interpolation[]
): Html {
  let out = strings[0] ?? '';
  values.forEach((value, i) => {
    out += render(value) + (strings[i + 1] ?? '');
  });
  return new Html(out);
}

/** Joins fragments with a separator (escaped unless it is `Html`). */
export function join(
  parts: readonly Interpolation[],
  separator: Interpolation = '',
): Html {
  return new Html(parts.map(render).join(render(separator)));
}
