import { pick } from '../../../i18n/ui';
import { filterByTag, tagsOf, TYPE_SHAPES } from '../../card/model';
import { commandButton } from '../core/blocks';
import { markup } from '../core/html';
import type { Command } from '../core/types';

const TAG_FLAGS = ['--tag', '-t'];

export type LsArgs =
  | { readonly kind: 'all' }
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'invalid' };

/** `ls`, `ls --tag x`, `ls --tag=x`, `ls -t x`. A tag may contain spaces. */
export function parseLsArgs(args: readonly string[]): LsArgs {
  if (args.length === 0) return { kind: 'all' };
  const [flag = '', ...rest] = args;
  const inline = /^--tag=(.+)$/.exec(flag);
  if (inline?.[1]) {
    return { kind: 'tag', tag: [inline[1], ...rest].join(' ') };
  }
  if (TAG_FLAGS.includes(flag) && rest.length > 0) {
    return { kind: 'tag', tag: rest.join(' ') };
  }
  return { kind: 'invalid' };
}

export const ls: Command = {
  name: 'ls',
  usage: '[--tag <tag>]',
  summary: pick((t) => t.commands.ls.summary),
  complete({ args }, ctx) {
    if (args.length === 0) return ['--tag'];
    if (args.length === 1 && TAG_FLAGS.includes(args[0] ?? '')) {
      return tagsOf(ctx.data.items);
    }
    return [];
  },
  run(input, ctx) {
    const strings = ctx.t.commands.ls;
    const types = ctx.t.card.types;
    const all = ctx.data.items;
    const tags = tagsOf(all);
    const tagButtons = markup`<p class="c-dim c-small c-ls-tags">${strings.tags} ${tags.map(
      (tag) => markup`${commandButton(`ls --tag ${tag}`, tag)} `,
    )}</p>`;

    if (all.length === 0) {
      ctx.print(markup`<p class="c-dim">${strings.empty}</p>`);
      return;
    }

    const parsed = parseLsArgs(input.args);
    if (parsed.kind === 'invalid') {
      ctx.print(markup`<p class="c-error">${strings.usage}</p>${tagButtons}`);
      return;
    }

    const items = parsed.kind === 'tag' ? filterByTag(all, parsed.tag) : all;
    if (items.length === 0) {
      ctx.print(
        markup`<p class="c-error">${strings.unknownTag} "${parsed.kind === 'tag' ? parsed.tag : ''}"</p>${tagButtons}`,
      );
      return;
    }

    const heading =
      parsed.kind === 'tag'
        ? markup`<p class="c-dim">${strings.filteredBy} <span class="c-title">${parsed.tag}</span> · ${commandButton('ls', strings.showAll)}</p>`
        : '';
    const rows = items.map(
      (item) =>
        markup`<li><span class="c-ls-shape" aria-hidden="true">${TYPE_SHAPES[item.type]}</span><span class="c-ls-main"><span class="sr-only">${types[item.type]}: </span>${commandButton(`cat ${item.id}`, item.title)} <span class="c-dim c-ls-id">${item.id}</span></span><span class="c-dim c-ls-date">${item.dates}</span></li>`,
    );
    ctx.print(
      markup`${heading}<ul class="c-ls">${rows}</ul>${tagButtons}<p class="c-dim c-small">${strings.hint}</p>`,
    );
  },
};
