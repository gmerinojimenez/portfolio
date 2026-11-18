// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'es',
    routing: {
      // Spanish also lives under /es/, not at the root.
      prefixDefaultLocale: true,
      // `/` is handled by `redirects` (S04 adds language detection).
      redirectToDefaultLocale: false,
    },
  },
  redirects: {
    '/': '/es/',
  },
});
