import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config';
import { viewerResponse } from './edge';

const CERT = 'arn:aws:acm:us-east-1:111111111111:certificate/abc';

describe('resolveConfig', () => {
  it('deploys with the default domain and no budget when nothing is set', () => {
    const config = resolveConfig({}, 'production');
    expect(config.isProduction).toBe(true);
    expect(config.domain).toBeUndefined();
    expect(config.budget).toBeUndefined();
  });

  it('switches to the custom domain with a single value', () => {
    const config = resolveConfig(
      { PORTFOLIO_DOMAIN: 'Example.COM' },
      'production',
    );
    expect(config.domain).toEqual({
      name: 'example.com',
      redirects: [],
      certArn: undefined,
    });
  });

  it('parses redirects and an external certificate', () => {
    const config = resolveConfig(
      {
        PORTFOLIO_DOMAIN: 'example.com',
        PORTFOLIO_DOMAIN_REDIRECTS: 'www.example.com, old.example.com',
        PORTFOLIO_CERT_ARN: CERT,
      },
      'production',
    );
    expect(config.domain?.redirects).toEqual([
      'www.example.com',
      'old.example.com',
    ]);
    expect(config.domain?.certArn).toBe(CERT);
  });

  it('ignores blank values (empty GitHub variables)', () => {
    const config = resolveConfig(
      { PORTFOLIO_DOMAIN: '  ', PORTFOLIO_BUDGET_EMAIL: '' },
      'production',
    );
    expect(config.domain).toBeUndefined();
    expect(config.budget).toBeUndefined();
  });

  it('never applies the domain or the budget to personal stages', () => {
    const config = resolveConfig(
      {
        PORTFOLIO_DOMAIN: 'example.com',
        PORTFOLIO_BUDGET_EMAIL: 'me@example.com',
      },
      'gmj',
    );
    expect(config.isProduction).toBe(false);
    expect(config.domain).toBeUndefined();
    expect(config.budget).toBeUndefined();
  });

  it('creates the budget with a default limit of 20', () => {
    const config = resolveConfig(
      { PORTFOLIO_BUDGET_EMAIL: 'me@example.com' },
      'production',
    );
    expect(config.budget).toEqual({ email: 'me@example.com', limitUsd: 20 });
  });

  it('rejects invalid values', () => {
    expect(() =>
      resolveConfig({ PORTFOLIO_DOMAIN: 'not a host' }, 'production'),
    ).toThrow();
    expect(() =>
      resolveConfig(
        {
          PORTFOLIO_DOMAIN: 'example.com',
          PORTFOLIO_CERT_ARN: CERT.replace('us-east-1', 'eu-west-1'),
        },
        'production',
      ),
    ).toThrow(/us-east-1/);
    expect(() =>
      resolveConfig({ PORTFOLIO_BUDGET_EMAIL: 'nope' }, 'production'),
    ).toThrow();
    expect(() =>
      resolveConfig(
        {
          PORTFOLIO_BUDGET_EMAIL: 'me@example.com',
          PORTFOLIO_BUDGET_LIMIT_USD: '-1',
        },
        'production',
      ),
    ).toThrow();
  });
});

describe('edge code', () => {
  it('viewer response sets the security headers and is valid JavaScript', () => {
    const event = {
      response: { headers: {} as Record<string, { value: string }> },
    };
    new Function('event', viewerResponse)(event);
    expect(Object.keys(event.response.headers)).toEqual(
      expect.arrayContaining([
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'referrer-policy',
      ]),
    );
  });
});
