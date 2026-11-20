import { pick } from '../../../i18n/ui';
import { fill } from '../../ai/format';
import { formatDates, TYPE_SHAPES } from '../../card/model';
import { TECH_FILTER_EVENT, type TechFilterDetail } from '../../map/filters';
import { findTech, type TechSummary } from '../../../lib/tech';
import { commandButton } from '../core/blocks';
import { markup, type Html } from '../core/html';
import type { Command, CommandContext } from '../core/types';

/** The tech's years and project count: `2015 – 2023 · 3 proyectos`. */
function techMeta(tech: TechSummary, ctx: CommandContext): string {
  const strings = ctx.t.commands.stack;
  const count =
    tech.items.length === 1
      ? strings.project
      : fill(strings.projects, { n: String(tech.items.length) });
  const years = formatDates(tech.from, tech.to, ctx.locale);
  return [years, count].filter(Boolean).join(' · ');
}

/** A technology as a button that runs `stack <id>`. */
function techButton(tech: TechSummary, ctx: CommandContext): Html {
  return markup`<button type="button" class="c-cmd c-tech" data-cmd="stack ${tech.id}" data-tech="${tech.id}">${tech.name} <span class="c-dim c-tech-meta">${techMeta(tech, ctx)}</span></button>`;
}

/** A line of tech buttons, with an optional label (`Prácticas:`). */
function techLine(
  techs: readonly TechSummary[],
  label: string,
  ctx: CommandContext,
): Html | string {
  if (techs.length === 0) return '';
  const prefix = label ? markup`<span class="c-dim">${label}:</span> ` : '';
  return markup`<p class="c-stack-techs">${prefix}${techs.map((tech) => markup`${techButton(tech, ctx)} `)}</p>`;
}

function renderAll(ctx: CommandContext): Html {
  const strings = ctx.t.commands.stack;
  const groups = ctx.data.stacks.map(
    (stack) =>
      markup`<section class="c-stack" aria-label="${stack.label}"><h3 class="c-stack-title">${stack.label}</h3>${techLine(stack.techs, '', ctx)}${techLine(stack.skills, strings.skills, ctx)}</section>`,
  );
  return markup`<p>${strings.heading}</p>${groups}<p class="c-dim c-small">${strings.hint}</p>`;
}

function renderTech(tech: TechSummary, ctx: CommandContext): Html {
  const strings = ctx.t.commands.stack;
  const types = ctx.t.card.types;
  const byId = new Map(ctx.data.items.map((item) => [item.id, item]));
  const rows = tech.items.flatMap((id) => {
    const item = byId.get(id);
    if (!item) return [];
    return [
      markup`<li><span class="c-ls-shape" aria-hidden="true">${TYPE_SHAPES[item.type]}</span><span class="c-ls-main"><span class="sr-only">${types[item.type]}: </span>${commandButton(`cat ${item.id}`, item.title)} <span class="c-dim c-ls-id">${item.context}</span></span><span class="c-dim c-ls-date">${item.dates}</span></li>`,
    ];
  });
  const actions = ctx.interactive
    ? markup`<p class="c-dim c-small c-stack-filter" data-stack-filter hidden><span>${fill(strings.filtered, { tech: tech.name })}</span> <button type="button" class="c-cmd" data-stack-show>${strings.showInTree}</button> <button type="button" class="c-cmd" data-stack-clear>${strings.clearFilter}</button></p>`
    : '';
  return markup`<div data-stack-tech="${tech.id}"><p><strong>${fill(strings.usedIn, { tech: tech.name })}</strong> <span class="c-dim">${techMeta(tech, ctx)}</span></p><ul class="c-ls">${rows}</ul>${actions}</div>`;
}

/** The most recent map in the console, if any is still in the log. */
function lastMap(output: HTMLElement): HTMLElement | undefined {
  const maps = output.ownerDocument.querySelectorAll<HTMLElement>('[data-map]');
  return maps[maps.length - 1];
}

function filterMap(map: HTMLElement, items: readonly string[] | null): void {
  map.dispatchEvent(
    new CustomEvent<TechFilterDetail>(TECH_FILTER_EVENT, {
      detail: { items },
    }),
  );
}

/**
 * `stack` (S15): the technologies by stack, with their years and projects.
 * `stack <tech>` (id, name or alias) lists the items that use it and limits
 * the career tree to them.
 */
export const stack: Command = {
  name: 'stack',
  usage: '[tech]',
  summary: pick((t) => t.commands.stack.summary),
  // `stack room` is a command; an unknown single word is a typo (it shows
  // the list); a longer unknown phrase is a question for the AI.
  accepts: (input) => input.args.length <= 1,
  complete({ args }, ctx) {
    if (args.length > 0) return [];
    return ctx.data.stacks.flatMap((s) =>
      [...s.techs, ...s.skills].map((tech) => tech.id),
    );
  },
  run(input, ctx) {
    const strings = ctx.t.commands.stack;
    if (ctx.data.stacks.length === 0) {
      ctx.print(markup`<p class="c-dim">${strings.empty}</p>`);
      return;
    }
    const query = input.args.join(' ');
    if (!query) {
      ctx.print(renderAll(ctx));
      return;
    }
    const tech = findTech(ctx.data.stacks, query);
    if (!tech) {
      ctx.print(
        markup`<p class="c-error">${strings.unknown} "${query}"</p>${renderAll(ctx)}`,
      );
      return;
    }
    ctx.print(renderTech(tech, ctx));
  },
  enhance(output, ctx) {
    const block = output.querySelector<HTMLElement>('[data-stack-tech]');
    const bar = output.querySelector<HTMLElement>('[data-stack-filter]');
    if (!block || !bar || !ctx.interactive) return;
    const tech = ctx.data.stacks
      .flatMap((s) => [...s.techs, ...s.skills])
      .find((t) => t.id === block.dataset.stackTech);
    const map = lastMap(output);
    if (!tech || !map) return;

    filterMap(map, tech.items);
    bar.hidden = false;
    bar.querySelector('[data-stack-show]')?.addEventListener('click', () => {
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      map.scrollIntoView({
        behavior: reduced ? 'auto' : 'smooth',
        block: 'start',
      });
    });
    bar.querySelector('[data-stack-clear]')?.addEventListener('click', () => {
      filterMap(map, null);
      bar.hidden = true;
    });
  },
};
