/**
 * Per-IP rate limit with fixed windows (one per minute, one per UTC day).
 * The IP is never stored: callers pass an HMAC of it (see ip-hash.ts).
 */
import type { CounterStore } from './store';

export interface RateLimits {
  perMinute: number;
  perDay: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = { perMinute: 5, perDay: 40 };

export type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class RateLimiter {
  constructor(
    private readonly store: CounterStore,
    private readonly limits: RateLimits = DEFAULT_RATE_LIMITS,
  ) {}

  async check(ipHash: string, now: Date): Promise<RateLimitResult> {
    const seconds = Math.floor(now.getTime() / 1000);
    const minute = Math.floor(seconds / 60);
    const minuteEnd = (minute + 1) * 60;
    const day = now.toISOString().slice(0, 10);
    const dayEnd = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000) + 86_400;

    const perMinute = await this.store.addIfWithin(
      `rate#${ipHash}#m#${minute}`,
      'count',
      1,
      this.limits.perMinute,
      minuteEnd + 120,
    );
    if (perMinute === null) {
      return { allowed: false, retryAfterSeconds: minuteEnd - seconds };
    }

    const perDay = await this.store.addIfWithin(
      `rate#${ipHash}#d#${day}`,
      'count',
      1,
      this.limits.perDay,
      dayEnd + 3_600,
    );
    if (perDay === null) {
      return { allowed: false, retryAfterSeconds: dayEnd - seconds };
    }
    return { allowed: true };
  }
}
