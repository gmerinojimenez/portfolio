/**
 * Code injected into the CloudFront Function that SST generates for the static
 * site's responses. CloudFront Functions run the cloudfront-js-2.0 runtime, so
 * keep it plain.
 *
 * Baseline security headers only. A Content-Security-Policy is left for the
 * specs that know which third parties the site talks to (S08 PostHog, S09 API).
 *
 * No viewer-request code is needed: SST's router already maps `/es` and `/es/`
 * to `es/index.html`.
 */

export const viewerResponse = `
var h = event.response.headers;
h['strict-transport-security'] = { value: 'max-age=31536000; includeSubDomains' };
h['x-content-type-options'] = { value: 'nosniff' };
h['x-frame-options'] = { value: 'DENY' };
h['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };
h['permissions-policy'] = { value: 'camera=(), microphone=(), geolocation=()' };
`;
