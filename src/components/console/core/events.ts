/**
 * Events the console announces to the rest of the page. It knows nothing
 * about who listens (today: analytics, `src/lib/analytics/`): it dispatches a
 * DOM `CustomEvent`, like an Android `LocalBroadcastManager` broadcast.
 * Payloads carry identifiers only, never free text typed by the visitor.
 */

export const CONSOLE_EVENT = 'console:event';

export type ConsoleEvent =
  /** The animated boot ended: it played to the end or the visitor skipped. */
  | { readonly type: 'boot'; readonly outcome: 'completed' | 'skipped' }
  /** A registered command ran. `command` is its canonical name. */
  | { readonly type: 'command'; readonly command: string }
  /** The input wasn't a command (the AI handles it). Only its length. */
  | { readonly type: 'unknown-input'; readonly length: number }
  /** The AI answered. Only how it ended (`end_turn`, `max_tokens`…). */
  | { readonly type: 'ai-answered'; readonly stopReason: string }
  /** The AI failed. Only the error code, never the text. */
  | { readonly type: 'ai-error'; readonly code: string }
  /** A card opened (dispatched by S05 with the item id). */
  | { readonly type: 'card-opened'; readonly itemId: string }
  /** The visitor is leaving for the other language version. */
  | {
      readonly type: 'language-switched';
      readonly from: string;
      readonly to: string;
    };

export function emitConsoleEvent(
  target: EventTarget,
  event: ConsoleEvent,
): void {
  target.dispatchEvent(
    new CustomEvent<ConsoleEvent>(CONSOLE_EVENT, {
      detail: event,
      bubbles: true,
    }),
  );
}
