import { pick } from '../../../i18n/ui';
import { fill } from '../../ai/format';
import { aiNotConfigured } from '../../ai/notices';
import { LIMITS } from '../../ai/protocol';
import { markup } from '../core/html';
import type { Command, CommandContext } from '../core/types';

/** Sends the offer to the AI; `undefined` when the build has no AI. */
export type OfferAnalyzer = (
  offer: string,
  ctx: CommandContext,
) => Promise<void>;

let counter = 0;

const formatCount = (n: number, locale: string) =>
  new Intl.NumberFormat(locale).format(n);

/**
 * `analiza-oferta` / `analyze-job` (S11): a text area to paste a job offer,
 * sent with the button or Ctrl/Cmd+Enter. The analysis itself is the AI's
 * (`ai/session.ts`); `runtime.ts` plugs it in when the build has an AI, like
 * the fallback. Offers over the limit are refused here and on the server;
 * the text area has no `maxlength` on purpose, so a long paste isn't cut
 * silently.
 */
export function createOfferCommand(analyze?: OfferAnalyzer): Command {
  return {
    name: 'analiza-oferta',
    names: { es: 'analiza-oferta', en: 'analyze-job' },
    aliases: ['analyze-offer'],
    summary: pick((t) => t.commands.offer.summary),
    run(_input, ctx) {
      const strings = ctx.t.commands.offer;
      const id = `c-offer-${(counter += 1)}`;
      const max = formatCount(LIMITS.maxOfferChars, ctx.locale);
      const intro = ctx.company
        ? fill(strings.introCompany, { company: ctx.company })
        : strings.intro;
      ctx.print(
        markup`<div class="c-offer" data-offer><p>${intro}</p><form class="c-offer-form" data-offer-form novalidate><label class="c-offer-label c-small" for="${id}">${strings.label}</label><textarea class="c-offer-text" id="${id}" name="offer" rows="7" placeholder="${strings.placeholder}" aria-describedby="${id}-hint ${id}-count" spellcheck="false" data-offer-text></textarea><div class="c-offer-bar"><span class="c-dim c-small" id="${id}-count" data-offer-count>${fill(strings.counter, { n: '0', max })}</span><button type="submit" class="c-cmd c-offer-submit">${strings.submit}</button></div><p class="c-dim c-small" id="${id}-hint">${fill(strings.hint, { max })}. ${strings.privacy}</p><p class="c-error c-small" data-offer-error role="alert" hidden></p></form></div>`,
      );
    },
    enhance(output, ctx) {
      const form = output.querySelector<HTMLFormElement>('[data-offer-form]');
      const text =
        output.querySelector<HTMLTextAreaElement>('[data-offer-text]');
      const count = output.querySelector<HTMLElement>('[data-offer-count]');
      const error = output.querySelector<HTMLElement>('[data-offer-error]');
      if (!form || !text || !count || !error) return;
      const strings = ctx.t.commands.offer;
      const max = formatCount(LIMITS.maxOfferChars, ctx.locale);

      const showError = (message: string) => {
        error.textContent = message;
        error.hidden = message === '';
        text.setAttribute('aria-invalid', String(message !== ''));
      };
      const update = () => {
        const length = text.value.trim().length;
        count.textContent = fill(strings.counter, {
          n: formatCount(length, ctx.locale),
          max,
        });
        count.classList.toggle('c-error', length > LIMITS.maxOfferChars);
        if (length <= LIMITS.maxOfferChars && !error.hidden) showError('');
      };

      text.addEventListener('input', update);
      text.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          form.requestSubmit();
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const offer = text.value.trim();
        if (!offer) return showError(strings.empty);
        if (offer.length > LIMITS.maxOfferChars) {
          return showError(fill(strings.tooLong, { max }));
        }
        showError('');
        // One analysis per form: paste another with the command again.
        text.readOnly = true;
        form
          .querySelectorAll('button')
          .forEach((button) => (button.disabled = true));
        if (!analyze) {
          ctx.print(aiNotConfigured(ctx));
          return;
        }
        void analyze(offer, ctx);
      });

      // A fresh form gets the focus, ready to paste.
      if (ctx.interactive) text.focus({ preventScroll: true });
    },
  };
}

/** The command without an AI behind it (the build's default). */
export const analyzeOffer = createOfferCommand();
