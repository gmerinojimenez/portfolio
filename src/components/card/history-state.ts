/**
 * How open cards are recorded in the browser history (pure, unit tested).
 *
 * The History API lets a page change its URL without reloading: pushState
 * adds an entry (like adding a fragment to the back stack on Android),
 * replaceState rewrites the current one, and the browser fires `popstate`
 * when the visitor goes back or forward. Each entry carries a small state
 * object, which is where we remember how many cards we stacked.
 */

export interface CardHistoryState {
  /** Id of the card this entry shows. */
  readonly card: string;
  /** How many card entries we pushed on top of the console page. */
  readonly depth: number;
  /** The visitor arrived directly on an item URL (nothing of ours behind). */
  readonly landed: boolean;
}

export function readCardState(state: unknown): CardHistoryState | undefined {
  if (state === null || typeof state !== 'object') return undefined;
  const { card, depth, landed } = state as Record<string, unknown>;
  if (typeof card !== 'string' || typeof depth !== 'number') return undefined;
  return { card, depth, landed: landed === true };
}

/** State of the entry pushed when a card opens. */
export function pushedState(
  current: CardHistoryState | undefined,
  cardWasOpen: boolean,
  id: string,
): CardHistoryState {
  if (!cardWasOpen || !current) return { card: id, depth: 1, landed: false };
  return { card: id, depth: current.depth + 1, landed: current.landed };
}

/** State of the entry when the page itself is an item URL. */
export function landedState(id: string): CardHistoryState {
  return { card: id, depth: 0, landed: true };
}

export type CloseAction =
  | { readonly kind: 'back'; readonly steps: number }
  | { readonly kind: 'replace'; readonly url: string };

/**
 * Closing a card returns to the console URL.
 * - Cards opened from the console: go back past all of them, so history
 *   looks as if they were never opened (and Forward reopens the last one).
 * - Arrived on an item URL: there is no console entry behind us, so rewrite
 *   the current entry to the console instead.
 */
export function closeAction(
  state: CardHistoryState | undefined,
  consoleUrl: string,
): CloseAction {
  if (state && !state.landed && state.depth > 0) {
    return { kind: 'back', steps: state.depth };
  }
  return { kind: 'replace', url: consoleUrl };
}
