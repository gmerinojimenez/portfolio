import type { Locale } from '../../lib/locales';
import type { Contact, SiteProfile } from './data';

/**
 * Who the site is about: name, headline, contact and CV.
 *
 * It isn't content in the S01 sense (there is exactly one, and it has no
 * status, translation review or relations), so it lives here as typed data
 * instead of a content collection. The console, the reading version and the
 * item pages import it.
 *
 * PLACEHOLDER: names, links and texts are made up. Replace them before
 * publishing.
 */

const contact: Contact = {
  email: 'hello@example.com',
  links: [
    {
      label: 'linkedin',
      href: 'https://www.linkedin.com/in/your-handle',
      text: 'linkedin.com/in/your-handle',
    },
    {
      label: 'github',
      href: 'https://github.com/your-handle',
      text: 'github.com/your-handle',
    },
    {
      label: 'medium',
      href: 'https://medium.com/@your-handle',
      text: 'medium.com/@your-handle',
    },
  ],
};

export const profiles: Record<Locale, SiteProfile> = {
  es: {
    profile: {
      name: 'Nombre Apellido',
      headline: 'Software engineer · Android · Full stack · IA aplicada',
      intro: [
        'Más de diez años construyendo apps que usan millones de personas.',
        'Ahora también llevo LLMs a producto, de la app al backend.',
      ],
    },
    contact,
    cv: null,
  },
  en: {
    profile: {
      name: 'Nombre Apellido',
      headline: 'Software engineer · Android · Full stack · Applied AI',
      intro: [
        'Over ten years building apps used by millions of people.',
        'These days I also ship LLMs into products, from the app to the backend.',
      ],
    },
    contact,
    cv: null,
  },
};
