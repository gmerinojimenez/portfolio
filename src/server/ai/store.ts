/**
 * Storage seam for the spend brake, the rate limiter and the question log.
 * Production uses DynamoDB (store-dynamo.ts); tests and local runs use
 * MemoryStore, which has the same atomic semantics.
 */

export interface CounterStore {
  /**
   * Atomically adds `amount` to the numeric attribute `field` of item `key`,
   * but only if the result stays <= `max`. Returns the new value, or `null`
   * when the addition would exceed `max` (nothing is written then).
   * `expiresAt` (epoch seconds) sets the item's TTL when it is created.
   */
  addIfWithin(
    key: string,
    field: string,
    amount: number,
    max: number,
    expiresAt: number,
  ): Promise<number | null>;

  /** Unconditional atomic additions (negative amounts subtract). */
  add(
    key: string,
    increments: Record<string, number>,
    expiresAt: number,
  ): Promise<void>;
}

export type Outcome =
  'answered' | 'refusal' | 'max_tokens' | 'budget_exhausted' | 'provider_error';

/** One row per question that reached the model or the brake. No IP data. */
export interface QuestionLogEntry {
  requestId: string;
  /** ISO timestamp. */
  at: string;
  locale: string;
  question: string;
  /** 1-based index of the question within the conversation. */
  turn: number;
  answer: string;
  sources: string[];
  outcome: Outcome;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costMicroUsd: number;
  latencyMs: number;
}

export interface QuestionLog {
  put(entry: QuestionLogEntry, expiresAt: number): Promise<void>;
}

/** In-memory store. Each operation runs synchronously, so it is atomic. */
export class MemoryStore implements CounterStore, QuestionLog {
  readonly items = new Map<string, Record<string, number>>();
  readonly logs: QuestionLogEntry[] = [];

  async addIfWithin(
    key: string,
    field: string,
    amount: number,
    max: number,
  ): Promise<number | null> {
    const item = this.items.get(key) ?? {};
    const next = (item[field] ?? 0) + amount;
    if (next > max) return null;
    item[field] = next;
    this.items.set(key, item);
    return next;
  }

  async add(key: string, increments: Record<string, number>): Promise<void> {
    const item = this.items.get(key) ?? {};
    for (const [field, amount] of Object.entries(increments)) {
      item[field] = (item[field] ?? 0) + amount;
    }
    this.items.set(key, item);
  }

  async put(entry: QuestionLogEntry): Promise<void> {
    this.logs.push(entry);
  }
}
