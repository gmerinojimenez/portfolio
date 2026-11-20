/**
 * The card's markup. One pure template for the whole site: the browser card
 * (dialog) and the static item page (S04) both render it, so they can never
 * drift apart. Built with the console's `markup` template, which escapes
 * everything except the trusted Markdown body.
 */
import { sectionPath } from '../../i18n/paths';
import { useTranslations } from '../../i18n/ui';
import type { Locale } from '../../lib/locales';
import { markup, raw, type Html } from '../console/core/html';
import { TYPE_SHAPES, type CardItem, type CardRef } from './model';

export const CARD_TITLE_ID = 'card-title';

export interface CardViewOptions {
  readonly locale: Locale;
  /** `h1` on the item's own page, `h2` inside the dialog. */
  readonly heading: 'h1' | 'h2';
}

/**
 * Related items and the parent app are real links to their pages. Without
 * JavaScript they simply navigate; with it, the card intercepts the click
 * (`data-card-open`) and swaps its content instead.
 */
function itemLink(target: CardRef, locale: Locale, className: string): Html {
  const type = useTranslations(locale).card.types[target.type];
  return markup`<a class="${className}" href="${target.path}" data-card-open="${target.id}"><span class="k-shape" aria-hidden="true">${TYPE_SHAPES[target.type]}</span><span class="sr-only">${type}: </span>${target.title}</a>`;
}

/** One `dt`/`dd` pair of the stack section; nothing when the list is empty. */
function stackRow(
  label: string,
  techs: readonly { id: string; name: string }[],
  reading: string,
): Html | string {
  if (techs.length === 0) return '';
  return markup`<dt>${label}</dt><dd><ul class="k-tags">${techs.map(
    (tech) =>
      markup`<li><a href="${reading}#tech-${tech.id}">${tech.name}</a></li>`,
  )}</ul></dd>`;
}

export function renderCard(item: CardItem, options: CardViewOptions): Html {
  const { locale } = options;
  const t = useTranslations(locale).card;
  const type = t.types[item.type];
  const meta = [item.context, item.dates].filter(Boolean).join(' · ');
  // Fallback items are in Spanish: tell screen readers which voice to use.
  const langAttr =
    item.lang !== locale ? markup` lang="${item.lang}"` : markup``;

  const title =
    options.heading === 'h1'
      ? markup`<h1 class="k-title" id="${CARD_TITLE_ID}" tabindex="-1"${langAttr}>${item.title}</h1>`
      : markup`<h2 class="k-title" id="${CARD_TITLE_ID}" tabindex="-1"${langAttr}>${item.title}</h2>`;

  const parent = item.parent
    ? markup`<p class="k-meta">${t.inside} ${itemLink(item.parent, locale, 'k-ref')}</p>`
    : '';
  const notice = item.fallback
    ? markup`<p class="k-notice" role="note">${t.fallback}</p>`
    : '';
  const role = item.role ? markup`<p class="k-meta">${item.role}</p>` : '';
  const summary = item.summary
    ? markup`<p class="k-summary">${item.summary}</p>`
    : '';
  const tags = item.tags.length
    ? markup`<ul class="k-tags">${item.tags.map((tag) => markup`<li>${tag}</li>`)}</ul>`
    : '';
  // Technologies by stack (S15); each links to its entry in the reading
  // version, which lists every project that uses it.
  const reading = sectionPath('reading', locale);
  const stack = item.stack.length
    ? markup`<section class="k-stack" aria-labelledby="card-stack"><h3 class="k-label" id="card-stack">${t.stack}</h3><dl>${item.stack.map(
        (group) => [
          stackRow(group.label, group.techs, reading),
          stackRow(
            t.skillsOf.replace('{stack}', group.label),
            group.skills,
            reading,
          ),
        ],
      )}</dl></section>`
    : '';
  const links = item.links.length
    ? markup`<ul class="k-links" aria-label="${t.links}">${item.links.map(
        (link) =>
          markup`<li><a class="k-link" href="${link.url}" rel="noopener" target="_blank">${link.label} →</a></li>`,
      )}</ul>`
    : '';
  const body = item.bodyHtml.trim()
    ? markup`<div class="k-body">${raw(item.bodyHtml)}</div>`
    : '';
  const related = item.related.length
    ? markup`<section class="k-related" aria-labelledby="card-related"><h3 class="k-label" id="card-related">${t.related}</h3><ul>${item.related.map(
        (r) => markup`<li>${itemLink(r, locale, 'k-ref')}</li>`,
      )}</ul></section>`
    : '';

  return markup`<header class="k-head"><p class="k-meta"><span class="k-badge k-type-${item.type}"><span aria-hidden="true">${TYPE_SHAPES[item.type]}</span> ${type}</span> <span>${meta}</span></p>${title}${parent}${role}</header>${notice}<div class="k-content"${langAttr}>${summary}${tags}${links}${body}${stack}</div>${related}`;
}
