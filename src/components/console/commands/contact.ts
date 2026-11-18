import { pick } from '../../../i18n/ui';
import type { Contact } from '../data';
import { markup, type Html } from '../core/html';
import type { Command } from '../core/types';

export const contact: Command = {
  name: 'contacto',
  names: { es: 'contacto', en: 'contact' },
  summary: pick((t) => t.commands.contact.summary),
  run(_input, ctx) {
    ctx.print(renderContact(ctx.data.contact, ctx.t.commands.contact.email));
  },
};

/** Also used for the `<noscript>` fallback of the page. */
export function renderContact(data: Contact, emailLabel: string): Html {
  const links = data.links.map(
    (link) =>
      markup`<span class="c-dim">${link.label}</span><a class="c-link" href="${link.href}" rel="me noopener" target="_blank">${link.text}</a>`,
  );
  return markup`<div class="c-grid"><span class="c-dim">${emailLabel}</span><a class="c-link" href="mailto:${data.email}">${data.email}</a>${links}</div>`;
}
