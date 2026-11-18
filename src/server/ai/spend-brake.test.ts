import { describe, expect, it } from 'vitest';
import { SpendBrake, dayKey } from './spend-brake';
import { MemoryStore, type CounterStore } from './store';

const day = new Date('2026-11-18T10:00:00Z');

/**
 * A store that yields to the event loop before every operation, so concurrent
 * requests really interleave (each operation itself stays atomic, as in
 * DynamoDB).
 */
class InterleavingStore implements CounterStore {
  constructor(readonly inner = new MemoryStore()) {}
  private async tick() {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
  }
  async addIfWithin(
    ...args: Parameters<CounterStore['addIfWithin']>
  ): Promise<number | null> {
    await this.tick();
    const store: CounterStore = this.inner;
    return store.addIfWithin(...args);
  }
  async add(...args: Parameters<CounterStore['add']>): Promise<void> {
    await this.tick();
    const store: CounterStore = this.inner;
    return store.add(...args);
  }
}

describe('SpendBrake', () => {
  it('reserves, then replaces the reservation with the real cost', async () => {
    const store = new MemoryStore();
    const brake = new SpendBrake(store, 1_000);
    const reservation = await brake.reserve(300, day);
    expect(reservation).toEqual({
      key: 'spend#2026-11-18',
      amountMicroUsd: 300,
    });
    expect(store.items.get('spend#2026-11-18')).toEqual({ committed: 300 });

    await brake.settle(reservation!, 120, day);
    expect(store.items.get('spend#2026-11-18')).toEqual({
      committed: 120,
      spent: 120,
      requests: 1,
    });
  });

  it('refuses a reservation that would go over the daily limit', async () => {
    const store = new MemoryStore();
    const brake = new SpendBrake(store, 1_000);
    expect(await brake.reserve(600, day)).not.toBeNull();
    expect(await brake.reserve(600, day)).toBeNull();
    // Nothing was written by the refused reservation.
    expect(store.items.get('spend#2026-11-18')?.committed).toBe(600);
    // Exactly reaching the limit is allowed.
    expect(await brake.reserve(400, day)).not.toBeNull();
    expect(await brake.reserve(1, day)).toBeNull();
  });

  it('a single call larger than the limit is refused even on an empty day', async () => {
    const brake = new SpendBrake(new MemoryStore(), 100);
    expect(await brake.reserve(101, day)).toBeNull();
  });

  it('a zero limit switches the AI off', async () => {
    const brake = new SpendBrake(new MemoryStore(), 0);
    expect(await brake.reserve(1, day)).toBeNull();
  });

  it('releases the reservation when the call fails', async () => {
    const store = new MemoryStore();
    const brake = new SpendBrake(store, 1_000);
    const reservation = await brake.reserve(700, day);
    await brake.release(reservation!, day);
    expect(store.items.get('spend#2026-11-18')?.committed).toBe(0);
    expect(await brake.reserve(1_000, day)).not.toBeNull();
  });

  it('uses one counter per UTC day and settles on the reservation day', async () => {
    const store = new MemoryStore();
    const brake = new SpendBrake(store, 1_000);
    const late = new Date('2026-11-18T23:59:59Z');
    const nextDay = new Date('2026-11-19T00:00:01Z');
    expect(dayKey(late)).not.toBe(dayKey(nextDay));

    const reservation = await brake.reserve(900, late);
    expect(await brake.reserve(900, nextDay)).not.toBeNull();
    await brake.settle(reservation!, 50, nextDay);
    expect(store.items.get('spend#2026-11-18')).toEqual({
      committed: 50,
      spent: 50,
      requests: 1,
    });
    expect(store.items.get('spend#2026-11-19')?.committed).toBe(900);
  });

  it('never exceeds the limit with 100 concurrent requests', async () => {
    const store = new InterleavingStore();
    const limit = 10_000;
    const brake = new SpendBrake(store, limit);

    const results = await Promise.all(
      Array.from({ length: 100 }, async () => {
        const reservation = await brake.reserve(900, day);
        if (!reservation) return false;
        const committed = store.inner.items.get(dayKey(day))?.committed ?? 0;
        expect(committed).toBeLessThanOrEqual(limit);
        // Real cost is always <= the reserved worst case.
        await brake.settle(reservation, 900, day);
        return true;
      }),
    );

    const accepted = results.filter(Boolean).length;
    expect(accepted).toBe(Math.floor(limit / 900)); // 11
    const item = store.inner.items.get(dayKey(day));
    expect(item?.committed).toBe(accepted * 900);
    expect(item?.spent).toBe(accepted * 900);
    expect(item?.requests).toBe(accepted);
    expect(item!.committed).toBeLessThanOrEqual(limit);
  });

  it('frees capacity for later requests when real costs are below the reservation', async () => {
    const store = new InterleavingStore();
    const brake = new SpendBrake(store, 1_000);
    const first = await Promise.all(
      Array.from({ length: 10 }, () => brake.reserve(500, day)),
    );
    const granted = first.filter((r) => r !== null);
    expect(granted).toHaveLength(2);
    await Promise.all(granted.map((r) => brake.settle(r!, 100, day)));
    // 200 spent: four more 200-µUSD reservations fit, a fifth does not.
    const second = await Promise.all(
      Array.from({ length: 6 }, () => brake.reserve(200, day)),
    );
    expect(second.filter((r) => r !== null)).toHaveLength(4);
  });
});
