import { describe, expect, it } from 'vitest';
import { LOCAL_DEV_ORIGIN, resolveAiConfig, scopeGateLinks } from './ai-config';
import { resolveConfig } from './config';

describe('resolveAiConfig', () => {
  it('is off, with no origins, by default on production', () => {
    const config = resolveConfig({}, 'production');
    expect(resolveAiConfig({}, config)).toEqual({
      enabled: false,
      allowedOrigins: [],
      dailyLimitUsd: 0.5,
      scopeGate: 'off',
    });
  });

  it('turns on only with PORTFOLIO_AI_ENABLED=true', () => {
    const config = resolveConfig({}, 'production');
    expect(
      resolveAiConfig({ PORTFOLIO_AI_ENABLED: 'true' }, config).enabled,
    ).toBe(true);
    expect(resolveAiConfig({ PORTFOLIO_AI_ENABLED: '1' }, config).enabled).toBe(
      false,
    );
  });

  it('derives origins from the custom domain and its redirects', () => {
    const config = resolveConfig(
      {
        PORTFOLIO_DOMAIN: 'example.com',
        PORTFOLIO_DOMAIN_REDIRECTS: 'www.example.com',
      },
      'production',
    );
    expect(resolveAiConfig({}, config).allowedOrigins).toEqual([
      'https://example.com',
      'https://www.example.com',
    ]);
  });

  it('adds explicit origins, normalized, and localhost on personal stages', () => {
    const config = resolveConfig({}, 'gmj');
    const ai = resolveAiConfig(
      { PORTFOLIO_AI_ALLOWED_ORIGINS: 'https://abc.cloudfront.net/ , ' },
      config,
    );
    expect(ai.allowedOrigins).toEqual([
      'https://abc.cloudfront.net',
      LOCAL_DEV_ORIGIN,
    ]);
  });

  it('rejects plain http origins and invalid limits', () => {
    const config = resolveConfig({}, 'production');
    expect(() =>
      resolveAiConfig(
        { PORTFOLIO_AI_ALLOWED_ORIGINS: 'http://evil.com' },
        config,
      ),
    ).toThrow();
    expect(() =>
      resolveAiConfig({ PORTFOLIO_AI_DAILY_LIMIT_USD: 'lots' }, config),
    ).toThrow();
    expect(
      resolveAiConfig({ PORTFOLIO_AI_DAILY_LIMIT_USD: '2' }, config)
        .dailyLimitUsd,
    ).toBe(2);
  });

  it('reads the scope gate mode and only links its secret when it runs', () => {
    const config = resolveConfig({}, 'production');
    const mode = (value?: string) =>
      resolveAiConfig({ PORTFOLIO_AI_SCOPE_GATE: value }, config);
    expect(mode().scopeGate).toBe('off');
    expect(mode(' shadow ').scopeGate).toBe('shadow');
    expect(mode('enforce').scopeGate).toBe('enforce');
    expect(() => mode('on')).toThrow(/PORTFOLIO_AI_SCOPE_GATE/);

    let created = 0;
    const secret = () => ++created;
    expect(scopeGateLinks(mode(), secret)).toEqual([]);
    expect(created).toBe(0);
    expect(scopeGateLinks(mode('shadow'), secret)).toEqual([1]);
    expect(scopeGateLinks(mode('enforce'), secret)).toEqual([2]);
  });
});
