import type { CommandContext } from '../console/core/types';
import { markup, type Html } from '../console/core/html';
import { sourceLinks, type RenderOptions } from './citations';
import { failureText, formatWait, type AiFailure } from './errors';
import { fill, transparencyLine } from './format';
import { commandSuggestions } from './notices';
import { LIMITS, type SourceRef } from './protocol';
import type { OfferResult, OfferView } from './session';

let counter = 0;

/** The text for a failed analysis: offer-specific where it matters. */
export function offerFailureText(
  failure: AiFailure,
  t: CommandContext['t'],
  locale: CommandContext['locale'],
): string {
  const max = new Intl.NumberFormat(locale).format(LIMITS.maxOfferChars);
  switch (failure.code) {
    case 'too_long':
      return fill(t.commands.offer.tooLong, { max });
    case 'invalid_request':
      return fill(t.commands.offer.invalid, { max });
    case 'bad_response':
      return t.commands.offer.unreadable;
    case 'rate_limited': {
      const text = fill(t.commands.offer.rateLimited, {
        perDay: String(LIMITS.offersPerDay),
      });
      return failure.retryAfterSeconds
        ? `${text} ${fill(t.ai.retryIn, { time: formatWait(failure.retryAfterSeconds) })}`
        : text;
    }
    default:
      return failureText(failure, t.ai).text;
  }
}

/**
 * Draws one job offer analysis (S11) into the console log: an "analyzing…"
 * line while the request runs (the analysis arrives in one piece), then the
 * analysis card. Same accessibility approach as answers (`view.ts`): the log
 * is `aria-busy` meanwhile and the card is added in one go.
 */
export function createOfferView(
  ctx: CommandContext,
  log: HTMLElement,
): OfferView {
  const { t, locale } = ctx;
  const strings = t.commands.offer;
  const id = `ai-offer-${(counter += 1)}`;
  ctx.print(
    markup`<div class="c-ai-answer c-offer-result" id="${id}"><span class="c-ai c-ai-star" aria-hidden="true">✦</span><div class="c-ai-content"><p class="c-dim" data-ai-status>${strings.analyzing}</p></div></div>`,
  );
  const content = log.querySelector<HTMLElement>(`#${id} .c-ai-content`);

  const cards = new Map(
    ctx.data.items.map((item) => [
      item.id,
      { title: item.title, path: item.path },
    ]),
  );
  const options = (sources: readonly SourceRef[]): RenderOptions => ({
    sources,
    cards,
  });

  const show = (html: Html) => {
    if (!content) return;
    const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
    content.innerHTML = html.value;
    if (pinned) log.scrollTop = log.scrollHeight;
  };

  return {
    finish({ analysis, done, sources }: OfferResult) {
      const byId = new Map(sources.map((s) => [s.id, s]));
      const heading = ctx.company
        ? fill(strings.headingCompany, { company: ctx.company })
        : strings.heading;
      const matches = analysis.matches.length
        ? markup`<ul class="c-offer-list">${analysis.matches.map((m) => {
            const cited = m.sources.flatMap((s) => byId.get(s) ?? []);
            return markup`<li><span class="c-title">${m.requirement}</span>: ${m.evidence}${cited.length ? markup` <span class="c-dim c-small c-offer-sources">[${sourceLinks(cited, options(sources))}]</span>` : ''}</li>`;
          })}</ul>`
        : markup`<p class="c-dim">${strings.noMatches}</p>`;
      const gaps = analysis.gaps.length
        ? markup`<ul class="c-offer-list">${analysis.gaps.map(
            (g) =>
              markup`<li><span class="c-title">${g.requirement}</span>${g.detail ? markup`: ${g.detail}` : ''}</li>`,
          )}</ul>`
        : markup`<p class="c-dim">${strings.noGaps}</p>`;
      const questions = analysis.questions.length
        ? markup`<h4 class="c-offer-h c-offer-h-questions"><span aria-hidden="true">? </span>${strings.questions}</h4><ul class="c-offer-list">${analysis.questions.map((q) => markup`<li>${q}</li>`)}</ul>`
        : '';
      show(
        markup`<div class="c-ai-body c-offer-card"><h3 class="c-offer-title">${heading}</h3><p>${analysis.summary}</p><h4 class="c-offer-h c-offer-h-matches"><span aria-hidden="true">✓ </span>${strings.matches}</h4>${matches}<h4 class="c-offer-h c-offer-h-gaps"><span aria-hidden="true">△ </span>${strings.gaps}</h4>${gaps}${questions}<p class="c-dim c-small c-ai-meta">${transparencyLine(done, locale, t.ai)}</p></div>`,
      );
    },

    fail(failure: AiFailure) {
      show(
        markup`<div class="c-ai-body"><p class="c-error c-ai-error">${offerFailureText(failure, t, locale)}</p>${failure.code === 'rate_limited' || failure.code === 'too_long' || failure.code === 'invalid_request' ? '' : commandSuggestions(ctx)}</div>`,
      );
    },
  };
}
