import { describe, expect, it } from 'vitest';
import { resolveConfig, POSTHOG_EU_HOST } from './config';
import { lengthBucket, toCapture } from './events';
import { classifyLink } from './links';
import { isOptedOut } from './privacy';
import { captureRef, sanitizeRef } from './ref';

describe('sanitizeRef', () => {
  it('accepts short lowercase slugs', () => {
    expect(sanitizeRef('empresa-x')).toBe('empresa-x');
    expect(sanitizeRef('acme_2026')).toBe('acme_2026');
  });

  it('lowercases and trims', () => {
    expect(sanitizeRef('  ACME-Corp ')).toBe('acme-corp');
  });

  it('rejects anything outside the allowlist', () => {
    expect(sanitizeRef('<script>')).toBeUndefined();
    expect(sanitizeRef('a b')).toBeUndefined();
    expect(sanitizeRef('a/b')).toBeUndefined();
    expect(sanitizeRef('-start')).toBeUndefined();
    expect(sanitizeRef('ñandú')).toBeUndefined();
    expect(sanitizeRef('')).toBeUndefined();
    expect(sanitizeRef(null)).toBeUndefined();
  });

  it('rejects values longer than 32 characters', () => {
    expect(sanitizeRef('a'.repeat(32))).toBe('a'.repeat(32));
    expect(sanitizeRef('a'.repeat(33))).toBeUndefined();
  });
});

describe('captureRef', () => {
  it('reads the ref and removes it from the URL', () => {
    expect(captureRef('https://x.dev/es/?ref=acme')).toEqual({
      ref: 'acme',
      cleanUrl: '/es/',
    });
  });

  it('keeps other params and the hash', () => {
    expect(captureRef('https://x.dev/en/?a=1&ref=acme&b=2#top').cleanUrl).toBe(
      '/en/?a=1&b=2#top',
    );
  });

  it('strips an invalid ref too, without keeping it', () => {
    expect(captureRef('https://x.dev/es/?ref=%3Cbad%3E')).toEqual({
      ref: undefined,
      cleanUrl: '/es/',
    });
  });

  it('does nothing when there is no ref', () => {
    expect(captureRef('https://x.dev/es/?a=1')).toEqual({
      ref: undefined,
      cleanUrl: undefined,
    });
  });
});

describe('isOptedOut', () => {
  it('is false without signals', () => {
    expect(isOptedOut({})).toBe(false);
    expect(isOptedOut({ doNotTrack: '0', globalPrivacyControl: false })).toBe(
      false,
    );
    expect(isOptedOut({ doNotTrack: 'unspecified' })).toBe(false);
  });

  it('detects Do Not Track in all its spellings', () => {
    expect(isOptedOut({ doNotTrack: '1' })).toBe(true);
    expect(isOptedOut({ doNotTrack: 'yes' })).toBe(true);
    expect(isOptedOut({ msDoNotTrack: '1' })).toBe(true);
    expect(isOptedOut({ windowDoNotTrack: '1' })).toBe(true);
  });

  it('detects Global Privacy Control', () => {
    expect(isOptedOut({ globalPrivacyControl: true })).toBe(true);
  });
});

describe('resolveConfig', () => {
  it('is off in dev', () => {
    expect(resolveConfig({ PROD: false, PUBLIC_POSTHOG_KEY: 'phc_x' })).toBe(
      undefined,
    );
  });

  it('is off without a key', () => {
    expect(resolveConfig({ PROD: true })).toBeUndefined();
    expect(resolveConfig({ PROD: true, PUBLIC_POSTHOG_KEY: '  ' })).toBe(
      undefined,
    );
  });

  it('uses the EU host by default', () => {
    expect(resolveConfig({ PROD: true, PUBLIC_POSTHOG_KEY: 'phc_x' })).toEqual({
      key: 'phc_x',
      host: POSTHOG_EU_HOST,
    });
  });

  it('allows a host override for tests', () => {
    expect(
      resolveConfig({
        PROD: true,
        PUBLIC_POSTHOG_KEY: 'phc_x',
        PUBLIC_POSTHOG_HOST: 'http://localhost:9999',
      })?.host,
    ).toBe('http://localhost:9999');
  });
});

describe('lengthBucket', () => {
  it('buckets lengths', () => {
    expect(lengthBucket(5)).toBe('1-20');
    expect(lengthBucket(20)).toBe('1-20');
    expect(lengthBucket(21)).toBe('21-80');
    expect(lengthBucket(150)).toBe('81-200');
    expect(lengthBucket(900)).toBe('200+');
  });
});

describe('toCapture', () => {
  const session = { locale: 'es', ref: 'acme' };

  it('maps a page view with locale and ref', () => {
    expect(toCapture({ type: 'pageview' }, session)).toEqual({
      name: '$pageview',
      properties: { locale: 'es', ref: 'acme' },
    });
  });

  it('omits ref when there is none', () => {
    expect(
      toCapture({ type: 'pageview' }, { locale: 'en' }).properties,
    ).toEqual({ locale: 'en' });
  });

  it('maps boot outcomes to two events', () => {
    expect(
      toCapture({ type: 'boot', outcome: 'completed' }, session).name,
    ).toBe('boot_completed');
    expect(toCapture({ type: 'boot', outcome: 'skipped' }, session).name).toBe(
      'boot_skipped',
    );
  });

  it('records only the command name', () => {
    expect(
      toCapture({ type: 'command', command: 'whoami' }, session).properties,
    ).toMatchObject({ command: 'whoami' });
  });

  it('records unknown input as a length bucket, never text', () => {
    const capture = toCapture({ type: 'unknown-input', length: 42 }, session);
    expect(capture.name).toBe('unknown_input');
    expect(capture.properties).toEqual({
      locale: 'es',
      ref: 'acme',
      length_bucket: '21-80',
    });
  });

  it('replaces ids that do not look like ids', () => {
    expect(
      toCapture(
        { type: 'command', command: 'hello there, my name is' },
        session,
      ).properties['command'],
    ).toBe('invalid');
    expect(
      toCapture({ type: 'card-opened', itemId: 'demo-acme-app' }, session)
        .properties['item_id'],
    ).toBe('demo-acme-app');
  });

  it('maps links and language switches', () => {
    expect(
      toCapture({ type: 'link-clicked', kind: 'github' }, session),
    ).toMatchObject({ name: 'link_clicked', properties: { kind: 'github' } });
    expect(
      toCapture({ type: 'language-switched', from: 'es', to: 'en' }, session),
    ).toMatchObject({
      name: 'language_switched',
      properties: { from: 'es', to: 'en' },
    });
  });

  it('adds the company to every event and maps the S11 events', () => {
    const visit = { locale: 'en', company: 'procter & gamble' };
    expect(toCapture({ type: 'pageview' }, visit).properties).toEqual({
      locale: 'en',
      company: 'procter & gamble',
    });
    expect(toCapture({ type: 'company-node-clicked' }, visit)).toEqual({
      name: 'company_node_clicked',
      properties: { locale: 'en', company: 'procter & gamble' },
    });
    expect(
      toCapture({ type: 'stack-tech-clicked', tech: 'room' }, visit),
    ).toEqual({
      name: 'stack_tech_clicked',
      properties: { locale: 'en', company: 'procter & gamble', tech: 'room' },
    });
    expect(
      toCapture({ type: 'stack-tech-clicked', tech: '<b>' }, visit).properties[
        'tech'
      ],
    ).toBe('invalid');
    expect(
      toCapture({ type: 'offer-analyzed', matches: 4, gaps: 2 }, visit),
    ).toEqual({
      name: 'offer_analyzed',
      properties: {
        locale: 'en',
        company: 'procter & gamble',
        matches: 4,
        gaps: 2,
      },
    });
  });
});

describe('classifyLink', () => {
  const origin = 'https://example.dev';

  it('classifies by kind, never by URL', () => {
    expect(classifyLink('mailto:a@b.c', origin)).toBe('email');
    expect(classifyLink('https://github.com/x', origin)).toBe('github');
    expect(classifyLink('https://www.linkedin.com/in/x', origin)).toBe(
      'linkedin',
    );
    expect(classifyLink('/es/cv.pdf', origin)).toBe('cv');
    expect(classifyLink('https://other.org/', origin)).toBe('external');
    expect(classifyLink('/es/privacidad', origin)).toBe('internal');
  });

  it('ignores other protocols and invalid URLs', () => {
    expect(classifyLink('javascript:void(0)', origin)).toBeUndefined();
    expect(classifyLink('tel:123', origin)).toBeUndefined();
  });
});
