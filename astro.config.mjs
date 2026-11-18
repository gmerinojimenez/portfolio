// @ts-check
/* global process, URL -- Node globals; the ESLint config has no Node env for .mjs */
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { switchLocalePath } from './src/i18n/paths.ts';

// The public origin, used for canonical URLs, hreflang and the sitemap.
// It comes from the same variable the infrastructure uses (infra/config.ts).
// Without it (local work, test stages) the site is not meant to be indexed:
// robots.txt then disallows everything (src/pages/robots.txt.ts).
const domain = process.env.PORTFOLIO_DOMAIN?.trim();
const site = domain ? `https://${domain}` : 'http://localhost:4321';

// https://astro.build/config
export default defineConfig({
  site,
  output: 'static',
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      // Spanish also lives under /es/, not at the root.
      prefixDefaultLocale: true,
      // `/` is src/pages/index.astro: it picks the visitor's language.
      redirectToDefaultLocale: false,
    },
  },
  integrations: [
    sitemap({
      // The language picker at `/` and the 404 page aren't real content.
      filter: (page) => {
        const { pathname } = new URL(page);
        return pathname !== '/' && !pathname.startsWith('/404');
      },
      // Section names are translated (/es/proyectos/ ↔ /en/projects/), so
      // the alternates are computed with the site's own path helper instead
      // of the integration's prefix-only i18n option.
      serialize: (item) => {
        const { pathname } = new URL(item.url);
        const lang = pathname.split('/')[1];
        if (lang !== 'es' && lang !== 'en') return item;
        item.links = ['es', 'en'].map((target) => ({
          lang: target,
          url: new URL(
            switchLocalePath(pathname, /** @type {'es' | 'en'} */ (target)),
            site,
          ).href,
        }));
        return item;
      },
    }),
  ],
});
