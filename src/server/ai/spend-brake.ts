/**
 * Daily spend brake (ADR 0003, 0013). Prepaid Anthropic credits are the hard
 * limit; this brake stops an attack from burning a month of credits in a day.
 *
 * Reserve-then-settle, so it holds under concurrency:
 * 1. Before the call, atomically reserve the call's worst-case cost, but only
 *    if `committed + reservation <= limit`. Concurrent requests cannot all
 *    pass the check: each addition is conditional on the latest value.
 * 2. After the call, replace the reservation with the real cost from `usage`.
 * 3. If the call fails before producing anything, release the reservation.
 *
 * A crash between 1 and 2 leaves the reservation in place: the brake errs on
 * the safe side.
 */
import type { CounterStore } from './store';

export const SPEND_TTL_DAYS = 40;

export interface Reservation {
  /** Store key of the day the reservation was made (settled on the same day). */
  key: string;
  amountMicroUsd: number;
}

export const dayKey = (now: Date): string =>
  `spend#${now.toISOString().slice(0, 10)}`;

const epochSeconds = (date: Date) => Math.floor(date.getTime() / 1000);

export class SpendBrake {
  constructor(
    private readonly store: CounterStore,
    private readonly dailyLimitMicroUsd: number,
  ) {}

  /** Returns a reservation, or `null` when the day's budget cannot cover it. */
  async reserve(
    amountMicroUsd: number,
    now: Date,
  ): Promise<Reservation | null> {
    const key = dayKey(now);
    const committed = await this.store.addIfWithin(
      key,
      'committed',
      amountMicroUsd,
      this.dailyLimitMicroUsd,
      this.expiresAt(now),
    );
    return committed === null ? null : { key, amountMicroUsd };
  }

  /** Swaps the reservation for the real cost and counts the request. */
  async settle(
    reservation: Reservation,
    actualMicroUsd: number,
    now: Date,
  ): Promise<void> {
    await this.store.add(
      reservation.key,
      {
        committed: actualMicroUsd - reservation.amountMicroUsd,
        spent: actualMicroUsd,
        requests: 1,
      },
      this.expiresAt(now),
    );
  }

  /** Gives the reservation back (the call failed before costing anything). */
  async release(reservation: Reservation, now: Date): Promise<void> {
    await this.store.add(
      reservation.key,
      { committed: -reservation.amountMicroUsd },
      this.expiresAt(now),
    );
  }

  private expiresAt(now: Date): number {
    return epochSeconds(now) + SPEND_TTL_DAYS * 86_400;
  }
}
