/**
 * Cloudflare Turnstile, the bot check the backend (S09) requires on every
 * question. Android analogy: Play Integrity. You ask Cloudflare for a token,
 * send it with the request, and the backend asks Cloudflare whether it's
 * genuine.
 *
 * - The script (`api.js`) is loaded only when the first question is asked, so
 *   visitors who never use the AI never contact Cloudflare.
 * - The widget is rendered explicitly with `execution: 'execute'` (nothing
 *   runs until we say so) and `appearance: 'interaction-only'` (it stays
 *   invisible unless Cloudflare needs the visitor to do something).
 * - A token is single-use and expires after 300 seconds, so each question
 *   gets a fresh one: `reset()` then `execute()`.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
 */

export const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The part of `window.turnstile` we use. */
export interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
}

export class TurnstileUnavailableError extends Error {
  constructor(reason: string) {
    super(`Turnstile unavailable: ${reason}`);
    this.name = 'TurnstileUnavailableError';
  }
}

/** Loads the script and resolves with the API. Injected in tests. */
export type ScriptLoader = () => Promise<TurnstileApi>;

function readApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

export const loadTurnstileScript: ScriptLoader = () =>
  new Promise<TurnstileApi>((resolve, reject) => {
    const existing = readApi();
    if (existing) return resolve(existing);
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      const api = readApi();
      if (!api) return reject(new TurnstileUnavailableError('no API'));
      resolve(api);
    });
    script.addEventListener('error', () => {
      script.remove();
      reject(new TurnstileUnavailableError('script blocked or offline'));
    });
    document.head.append(script);
  });

interface Pending {
  readonly resolve: (token: string) => void;
  readonly reject: (error: Error) => void;
}

export class TurnstileTokens {
  private apiPromise: Promise<TurnstileApi> | undefined;
  private widgetId: string | undefined;
  private pending: Pending | undefined;

  constructor(
    private readonly siteKey: string,
    /** Where the widget lives (visible only if Cloudflare asks for a click). */
    private readonly container: () => HTMLElement,
    private readonly loadScript: ScriptLoader = loadTurnstileScript,
    private readonly timeoutMs = 60_000,
  ) {}

  /** A fresh single-use token. Loads the script the first time. */
  async token(): Promise<string> {
    // A previous call that never finished must not leak into this one.
    this.settle((p) => p.reject(new TurnstileUnavailableError('superseded')));
    const api = await this.api();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.settle((p) =>
            p.reject(new TurnstileUnavailableError('timeout')),
          ),
        this.timeoutMs,
      );
      this.pending = {
        resolve: (token) => {
          clearTimeout(timer);
          resolve(token);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      try {
        if (this.widgetId === undefined) {
          this.widgetId = api.render(this.container(), {
            sitekey: this.siteKey,
            execution: 'execute',
            appearance: 'interaction-only',
            theme: 'dark',
            callback: (token: string) => this.settle((p) => p.resolve(token)),
            'error-callback': (code: unknown) => {
              this.settle((p) =>
                p.reject(
                  new TurnstileUnavailableError(`error ${String(code)}`),
                ),
              );
              return true; // handled: Cloudflare needn't log it to the console
            },
            'timeout-callback': () =>
              this.settle((p) =>
                p.reject(new TurnstileUnavailableError('timeout')),
              ),
          });
        } else {
          api.reset(this.widgetId);
        }
        api.execute(this.widgetId);
      } catch (error) {
        this.settle((p) =>
          p.reject(
            error instanceof Error
              ? error
              : new TurnstileUnavailableError('render'),
          ),
        );
      }
    });
  }

  private api(): Promise<TurnstileApi> {
    // The script's `load` event means `window.turnstile` is usable: with
    // explicit rendering there is no need for `turnstile.ready()`.
    this.apiPromise ??= this.loadScript().catch((error: unknown) => {
      this.apiPromise = undefined; // allow a retry (e.g. after going online)
      throw error;
    });
    return this.apiPromise;
  }

  private settle(action: (pending: Pending) => void): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) action(pending);
  }
}
