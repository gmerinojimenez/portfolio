import type { APIRoute } from 'astro';

/**
 * robots.txt is generated (not a file in public/) because it depends on the
 * domain: with a real domain it allows everything and points to the sitemap;
 * without one (local work, test stages on *.cloudfront.net) it asks search
 * engines to stay out.
 */
export const GET: APIRoute = ({ site }) => {
  const indexable = site !== undefined && site.hostname !== 'localhost';
  const body = indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site).href}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
