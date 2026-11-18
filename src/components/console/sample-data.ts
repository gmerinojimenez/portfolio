import type { Locale } from '../../lib/locales';
import type { ConsoleData, Contact } from './data';

// Hand-written placeholder data until the content layer (S01) exists.
// Names, links and texts are made up: replace them, don't ship them.

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

export const sampleData: Record<Locale, ConsoleData> = {
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
