import { describe, expect, it } from 'vitest';
import { hashIp } from './ip-hash';
import { RateLimiter } from './rate-limit';
import { MemoryStore } from './store';
import { createTurnstileVerifier, SITEVERIFY_URL } from './turnstile';

describe('RateLimiter', () => {
  const at = (iso: string) => new Date(iso);

  it('allows N per minute and tells how long to wait', async () => {
    const limiter = new RateLimiter(new MemoryStore(), {
      perMinute: 2,
      perDay: 100,
    });
    const now = at('2026-11-18T10:00:15Z');
    expect(await limiter.check('ip', now)).toEqual({ allowed: true });
    expect(await limiter.check('ip', now)).toEqual({ allowed: true });
    expect(await limiter.check('ip', now)).toEqual({
      allowed: false,
      retryAfterSeconds: 45,
    });
    // Another IP has its own window; the next minute starts fresh.
    expect((await limiter.check('other', now)).allowed).toBe(true);
    expect(
      (await limiter.check('ip', at('2026-11-18T10:01:00Z'))).allowed,
    ).toBe(true);
  });

  it('applies the daily window across minutes', async () => {
    const limiter = new RateLimiter(new MemoryStore(), {
      perMinute: 10,
      perDay: 3,
    });
    for (const minute of ['10', '11', '12']) {
      expect(
        (await limiter.check('ip', at(`2026-11-18T10:${minute}:00Z`))).allowed,
      ).toBe(true);
    }
    expect(await limiter.check('ip', at('2026-11-18T22:00:00Z'))).toEqual({
      allowed: false,
      retryAfterSeconds: 2 * 3600,
    });
    expect(
      (await limiter.check('ip', at('2026-11-19T00:00:00Z'))).allowed,
    ).toBe(true);
  });

  it('holds under concurrent requests from the same IP', async () => {
    const limiter = new RateLimiter(new MemoryStore(), {
      perMinute: 5,
      perDay: 100,
    });
    const now = at('2026-11-18T10:00:00Z');
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.check('ip', now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe('hashIp', () => {
  it('is stable, salted and does not contain the IP', () => {
    const a = hashIp('203.0.113.7', 'salt-1');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp('203.0.113.7', 'salt-1')).toBe(a);
    expect(hashIp('203.0.113.7', 'salt-2')).not.toBe(a);
    expect(hashIp('203.0.113.8', 'salt-1')).not.toBe(a);
  });

  it('refuses an empty salt', () => {
    expect(() => hashIp('203.0.113.7', '')).toThrow();
  });
});

describe('Turnstile verifier', () => {
  const fakeFetch =
    (body: unknown, ok = true) =>
    async (url: string, init: { body: URLSearchParams }) => {
      expect(url).toBe(SITEVERIFY_URL);
      expect(init.body.get('secret')).toBe('secret');
      expect(init.body.get('remoteip')).toBeNull();
      return { ok, json: async () => body };
    };

  it('accepts a successful check on an allowed hostname', async () => {
    const verify = createTurnstileVerifier(
      'secret',
      ['example.com'],
      fakeFetch({ success: true, hostname: 'example.com' }),
    );
    expect(await verify('token')).toBe(true);
  });

  it('rejects failures, other hostnames, empty tokens and network errors', async () => {
    const hosts = ['example.com'];
    expect(
      await createTurnstileVerifier(
        'secret',
        hosts,
        fakeFetch({ success: false }),
      )('token'),
    ).toBe(false);
    expect(
      await createTurnstileVerifier(
        'secret',
        hosts,
        fakeFetch({ success: true, hostname: 'evil.com' }),
      )('token'),
    ).toBe(false);
    expect(
      await createTurnstileVerifier(
        'secret',
        hosts,
        fakeFetch({}, false),
      )('token'),
    ).toBe(false);
    expect(
      await createTurnstileVerifier(
        'secret',
        hosts,
        fakeFetch({ success: true }),
      )(''),
    ).toBe(false);
    expect(
      await createTurnstileVerifier('secret', hosts, async () => {
        throw new Error('network');
      })('token'),
    ).toBe(false);
  });
});
