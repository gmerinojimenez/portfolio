/**
 * Shell-style input history for ↑/↓. Keeps what the visitor was typing
 * (the draft) so that going back down past the newest entry restores it.
 */
export class History {
  private readonly items: string[];
  /** Index into `items` while browsing; `items.length` means "at the draft". */
  private cursor: number;
  private draft = '';

  constructor(
    initial: readonly string[] = [],
    private readonly limit = 100,
  ) {
    this.items = initial.slice(-limit);
    this.cursor = this.items.length;
  }

  /** Oldest first. */
  get entries(): readonly string[] {
    return this.items;
  }

  push(entry: string): void {
    const value = entry.trim();
    if (value && this.items[this.items.length - 1] !== value) {
      this.items.push(value);
      if (this.items.length > this.limit) this.items.shift();
    }
    this.reset();
  }

  /** Older entry, or `undefined` if there is none. */
  previous(current: string): string | undefined {
    if (this.cursor === 0 || this.items.length === 0) return undefined;
    if (this.cursor === this.items.length) this.draft = current;
    this.cursor -= 1;
    return this.items[this.cursor];
  }

  /** Newer entry, the draft when leaving the newest one, else `undefined`. */
  next(): string | undefined {
    if (this.cursor >= this.items.length) return undefined;
    this.cursor += 1;
    return this.cursor === this.items.length
      ? this.draft
      : this.items[this.cursor];
  }

  reset(): void {
    this.cursor = this.items.length;
    this.draft = '';
  }
}
