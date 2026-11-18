import { existsSync } from 'node:fs';
import type { PortfolioConfig } from './config';
import { viewerResponse } from './edge';

/**
 * Static site: private S3 bucket + CloudFront (Origin Access Control, HTTPS).
 * `sst.aws.StaticSite` creates all of that; this file only configures it.
 *
 * Without `config.domain` the site is served from the *.cloudfront.net URL.
 * Setting PORTFOLIO_DOMAIN switches to the custom domain with no code change.
 */
export function createSite(config: PortfolioConfig) {
  const { domain } = config;

  return new sst.aws.StaticSite('Site', {
    build: { command: 'pnpm build', output: 'dist' },
    // Use the S04 404 page as soon as it exists; until then SST falls back to
    // the root index.html.
    errorPage: existsSync('src/pages/404.astro') ? '404.html' : undefined,
    assets: {
      // Later entries override earlier ones.
      fileOptions: [
        // Unhashed files from public/ (favicon, robots.txt...): a day.
        { files: '**', cacheControl: 'public,max-age=86400' },
        // Astro fingerprints everything it emits under _astro/: forever.
        {
          files: '_astro/**',
          cacheControl: 'public,max-age=31536000,immutable',
        },
        // HTML is revalidated on every request (cheap 304s thanks to ETag),
        // so a deploy is visible immediately.
        {
          files: '**/*.html',
          cacheControl: 'public,max-age=0,must-revalidate',
        },
      ],
    },
    edge: {
      viewerResponse: { injection: viewerResponse },
    },
    // Rebuild the cache after each deploy; HTML revalidates anyway, so this is
    // just a safety net for files from public/.
    invalidation: { paths: 'all', wait: false },
    domain: domain && {
      name: domain.name,
      redirects: domain.redirects.length ? domain.redirects : undefined,
      // CloudFront certificates must live in us-east-1. SST creates and
      // validates it there on its own when DNS is in Route 53; with an
      // external DNS provider pass an existing certificate instead.
      ...(domain.certArn
        ? { cert: domain.certArn, dns: false as const }
        : { dns: sst.aws.dns() }),
    },
  });
}
