type Wait = (ms: number) => Promise<void>;

const defaultWait: Wait = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Controls typing and streaming effects. With reduced motion every pause is
 * instant; `skip()` finishes the animation in progress immediately (pending
 * pauses resolve at once) until `resume()` is called.
 */
export class Animator {
  private skipping = false;
  private readonly pending = new Set<() => void>();

  constructor(
    private readonly reducedMotion: boolean,
    private readonly wait: Wait = defaultWait,
  ) {}

  /** `true` when pauses currently resolve immediately. */
  get instant(): boolean {
    return this.reducedMotion || this.skipping;
  }

  sleep(ms: number): Promise<void> {
    if (this.instant || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      void this.wait(ms).then(done);
    });
  }

  skip(): void {
    this.skipping = true;
    for (const done of [...this.pending]) done();
  }

  resume(): void {
    this.skipping = false;
  }
}

/** Types `text` into `target` one character at a time. */
export async function typeInto(
  target: { textContent: string | null },
  text: string,
  animator: Animator,
  delay = 28,
): Promise<void> {
  target.textContent = '';
  for (let i = 0; i < text.length; i += 1) {
    if (animator.instant) break;
    target.textContent = text.slice(0, i + 1);
    await animator.sleep(delay);
  }
  target.textContent = text;
}
