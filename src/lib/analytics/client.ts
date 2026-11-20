/**
 * Browser entry of analytics, included once from `Base.astro`. Everything is
 * opt-in by construction: nothing is loaded (not even the PostHog library)
 * unless this is a production build with a project key and the visitor
 * isn't sending Do Not Track or Global Privacy Control.
 *
 * No cookies, no localStorage: PostHog runs in `cookieless_mode: 'always'`,
 * where the visitor isn't identified on the device at all. See
 * docs/specs/08-analytics.md.
 */
import {
  CONSOLE_EVENT,
  type ConsoleEvent,
} from '../../components/console/core/events';
import { isLocale } from '../locales';
import { resolveConfig } from './config';
import { toCapture, type AnalyticsEvent, type Session } from './events';
import { classifyLink } from './links';
import { isOptedOut, readPrivacySignals } from './privacy';
import { captureRef } from './ref';
import { companyProperty, readCompany } from '../company';
import { readTrack } from '../track';

function start(): void {
  // Always strip `?ref=` from the address bar (it's read only once), even
  // when analytics is off, so the visitor doesn't re-share a tagged link.
  const { ref, cleanUrl } = captureRef(location.href);
  if (cleanUrl !== undefined) history.replaceState(history.state, '', cleanUrl);

  const config = resolveConfig(import.meta.env);
  if (!config) return;
  if (isOptedOut(readPrivacySignals(navigator, window))) return;

  const lang = document.documentElement.lang;
  // `?company=` stays in the URL (S11), so every page of the visit has it.
  const company = readCompany(location.search);
  const profileTrack = readTrack(location.search);
  const session: Session = {
    locale: isLocale(lang) ? lang : 'es',
    ref,
    ...(company ? { company: companyProperty(company) } : {}),
    // `?track=` (S16) stays in the URL too.
    ...(profileTrack ? { track: profileTrack } : {}),
  };

  // The library loads as a separate chunk, after the page is usable.
  const posthog = import('posthog-js').then(({ default: ph }) => {
    ph.init(config.key, {
      api_host: config.host,
      cookieless_mode: 'always',
      persistence: 'memory',
      person_profiles: 'never',
      respect_dnt: true,
      // Only our own events: no autocapture of clicks or inputs, no page
      // view or page leave by itself, nothing that records the screen.
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      capture_performance: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_conversations: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
    });
    return ph;
  });

  const track = (event: AnalyticsEvent): void => {
    const { name, properties } = toCapture(event, session);
    // The page may unload right after a language switch: sendBeacon survives.
    const options =
      event.type === 'language-switched'
        ? { transport: 'sendBeacon' as const }
        : undefined;
    void posthog.then((ph) => ph.capture(name, properties, options));
  };

  document.addEventListener(CONSOLE_EVENT, (event) => {
    track((event as CustomEvent<ConsoleEvent>).detail);
  });

  document.addEventListener('click', (event) => {
    const anchor = (event.target as Element | null)?.closest('a[href]');
    if (!anchor) return;
    const kind = classifyLink(
      anchor.getAttribute('href') ?? '',
      location.origin,
    );
    if (kind && kind !== 'internal') track({ type: 'link-clicked', kind });
  });

  track({ type: 'pageview' });
}

start();
