import { commandButton } from '../console/core/blocks';
import { join, markup, type Html } from '../console/core/html';
import type { SourceRef } from './protocol';

/** What the page can open for an id: the card's title and its own URL. */
export interface CardTarget {
  readonly title: string;
  readonly path: string;
}

export interface RenderOptions {
  /** From the `done` event. Empty while streaming: nothing links yet. */
  readonly sources: readonly SourceRef[];
  /** Cards that exist on this page, by item id. */
  readonly cards: ReadonlyMap<string, CardTarget>;
  /** Command names (in this language) that backticks turn into buttons. */
  readonly isCommand?: (name: string) => boolean;
  /** Text still arriving: hide a half-received `[id`. */
  readonly streaming?: boolean;
}

const INLINE = /\[([^[\]\n]{1,200})\]|`([^`\n]+)`|\*\*([^*\n]+?)\*\*/g;
const BULLET = /^\s*[-*•]\s+(.*)$/;

/** One cited id as a link to its card, or plain text if it has no card. */
function citation(source: SourceRef, options: RenderOptions): Html {
  const card = options.cards.get(source.id);
  if (!card) {
    return markup`<span class="c-cite c-dim">${source.title}</span>`;
  }
  return markup`<a class="c-link c-cite" href="${card.path}" data-card-open="${source.id}">${card.title}</a>`;
}

/**
 * Turns the model's `[id]` citations into links, but only for ids the
 * backend listed in `sources`. The model could write anything between
 * brackets; the rest of the text stays text. Several ids in one bracket
 * (`[a, b]`) are handled one by one.
 */
function bracket(group: string, options: RenderOptions): Html {
  const byId = new Map(options.sources.map((s) => [s.id, s]));
  const parts = group.split(/\s*[,;]\s*/).map((p) => p.trim());
  if (!parts.some((p) => byId.has(p))) return markup`[${group}]`;
  const linked = parts.map((part) => {
    const source = byId.get(part);
    return source ? citation(source, options) : part;
  });
  return markup`[${join(linked, ', ')}]`;
}

/** Inline formatting: citations, `code` and **bold**. Everything else is escaped. */
function inline(text: string, options: RenderOptions): Html {
  const parts: Html[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    parts.push(markup`${text.slice(last, index)}`);
    const [, cited, code, bold] = match;
    if (cited !== undefined) parts.push(bracket(cited, options));
    else if (code !== undefined) {
      parts.push(
        options.isCommand?.(code.trim())
          ? commandButton(code.trim())
          : markup`<code class="c-code">${code}</code>`,
      );
    } else parts.push(markup`<strong>${bold}</strong>`);
    last = index + match[0].length;
  }
  parts.push(markup`${text.slice(last)}`);
  return join(parts);
}

/**
 * The answer as HTML: paragraphs, bullet lists, **bold**, `code` and linked
 * citations. It's a small subset of Markdown on purpose (the prompt asks for
 * short answers); every character from the model is escaped.
 */
export function renderAnswer(text: string, options: RenderOptions): Html {
  const visible = options.streaming
    ? text.replace(/\[[^\]\n]{0,200}$/, '')
    : text;
  const blocks = visible
    .trim()
    .split(/\n{2,}/)
    .filter((block) => block.trim());
  return join(
    blocks.map((block) => {
      const out: Html[] = [];
      let prose: string[] = [];
      let items: string[] = [];
      const flushProse = () => {
        if (prose.length) {
          out.push(
            markup`<p>${join(
              prose.map((l) => inline(l, options)),
              markup`<br>`,
            )}</p>`,
          );
        }
        prose = [];
      };
      const flushItems = () => {
        if (items.length) {
          out.push(
            markup`<ul class="c-ai-list">${items.map((i) => markup`<li>${inline(i, options)}</li>`)}</ul>`,
          );
        }
        items = [];
      };
      for (const line of block.split('\n')) {
        const bullet = BULLET.exec(line);
        if (bullet?.[1] !== undefined) {
          flushProse();
          items.push(bullet[1]);
        } else {
          flushItems();
          prose.push(line.trim());
        }
      }
      flushProse();
      flushItems();
      return join(out);
    }),
  );
}

/** "Sources: [title] · [title]", each a link that opens its card. */
export function renderSources(
  sources: readonly SourceRef[],
  options: RenderOptions,
  label: string,
): Html {
  if (sources.length === 0) return markup``;
  return markup`<p class="c-dim c-small c-sources">${label} ${join(
    sources.map((s) => citation(s, options)),
    ' · ',
  )}</p>`;
}
