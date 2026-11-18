/**
 * The detail card in the browser: a modal <dialog> that is a side panel on
 * desktop and a bottom sheet on mobile (see card.css), kept in sync with the
 * URL. Other features open it through `openCard(id, items, locale)`:
 * `cat` (S05), map nodes (S07) and AI sources (S10).
 *
 * Focus management, in Android terms: like a modal bottom sheet, focus moves
 * into it when it opens, can't leave it while it is open (`showModal()` makes
 * the rest of the page inert, the web's version of a dialog window), and goes
 * back to the view that opened it when it closes.
 *
 * Events for analytics (S08): `card:open` and `card:close` on `document`,
 * with `detail.id`.
 */
import { itemIdFromPath, localeHome } from '../../i18n/paths';
import { useTranslations } from '../../i18n/ui';
import type { Locale } from '../../lib/locales';
import { CARD_TITLE_ID, renderCard } from './card-view';
import {
  closeAction,
  landedState,
  pushedState,
  readCardState,
} from './history-state';
import type { CardItem } from './model';

type HistoryMode = 'push' | 'land' | 'none';

class CardController {
  private readonly dialog: HTMLDialogElement;
  private readonly content: HTMLElement;
  private readonly byId: Map<string, CardItem>;
  private readonly baseTitle: string;
  private returnTo: HTMLElement | null = null;
  private currentId: string | undefined;
  private updateHistoryOnClose = true;

  constructor(
    items: readonly CardItem[],
    private readonly locale: Locale,
    private readonly fallbackFocus: () => HTMLElement | null,
  ) {
    const t = useTranslations(locale);
    this.byId = new Map(items.map((item) => [item.id, item]));
    this.baseTitle = t.meta.title;

    this.dialog = document.createElement('dialog');
    this.dialog.className = 'k-card';
    this.dialog.setAttribute('aria-labelledby', CARD_TITLE_ID);
    this.dialog.innerHTML = `<div class="k-sheet"><div class="k-handle" aria-hidden="true"></div><button type="button" class="k-close" data-card-close></button><div class="k-scroll" data-card-content></div></div>`;
    const closeButton =
      this.dialog.querySelector<HTMLButtonElement>('[data-card-close]');
    if (closeButton) {
      closeButton.textContent = '✕';
      closeButton.setAttribute('aria-label', t.card.close);
      closeButton.addEventListener('click', () => this.close());
    }
    this.content = this.dialog.querySelector('[data-card-content]')!;
    document.body.append(this.dialog);

    // Clicks on the backdrop target the <dialog> itself (its content box is
    // filled by .k-sheet). Both press and release must be outside, so
    // selecting text and releasing outside doesn't close it.
    let pressedOutside = false;
    this.dialog.addEventListener('pointerdown', (event) => {
      pressedOutside = event.target === this.dialog;
    });
    this.dialog.addEventListener('click', (event) => {
      if (pressedOutside && event.target === this.dialog) this.close();
    });
    // Esc closes the dialog natively; every way of closing ends here.
    this.dialog.addEventListener('close', () => this.afterClose());

    // Links to item pages (related items, `cat` output, map legend…) open
    // the card in place instead of loading a new page. Modified clicks
    // (new tab, etc.) keep the browser's default.
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || isModified(event)) return;
      const link = (event.target as Element | null)?.closest<HTMLElement>(
        'a[data-card-open]',
      );
      const id = link?.dataset.cardOpen;
      if (id && this.byId.has(id)) {
        event.preventDefault();
        this.open(id);
      }
    });

    window.addEventListener('popstate', () => this.syncWithLocation('none'));
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  open(id: string, mode: HistoryMode = 'push'): boolean {
    const item = this.byId.get(id);
    if (!item) return false;
    const wasOpen = this.dialog.open;
    if (!wasOpen) {
      const active = document.activeElement;
      this.returnTo =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
    }

    this.content.innerHTML = renderCard(item, {
      locale: this.locale,
      heading: 'h2',
    }).value;
    this.content.scrollTop = 0;
    this.currentId = id;

    if (mode === 'push' && location.pathname !== item.path) {
      const state = pushedState(readCardState(history.state), wasOpen, id);
      history.pushState(state, '', item.path);
    } else if (mode === 'land') {
      history.replaceState(landedState(id), '', location.href);
    }
    document.title = `${item.title} · ${this.baseTitle}`;

    if (!wasOpen) this.dialog.showModal();
    // Focus the title (not the ✕) so screen readers start with what it is.
    this.content
      .querySelector<HTMLElement>(`#${CARD_TITLE_ID}`)
      ?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('card:open', { detail: { id } }));
    return true;
  }

  /** `updateHistory: false` when the URL already changed (back/forward). */
  close(updateHistory = true): void {
    if (!this.dialog.open) return;
    this.updateHistoryOnClose = updateHistory;
    this.dialog.close();
  }

  /** Opens or closes the card to match the current URL. */
  syncWithLocation(mode: HistoryMode): void {
    const id = itemIdFromPath(location.pathname);
    if (id && this.byId.has(id)) {
      if (id !== this.currentId || !this.dialog.open) this.open(id, mode);
    } else {
      this.close(false);
    }
  }

  private afterClose(): void {
    const updateHistory = this.updateHistoryOnClose;
    this.updateHistoryOnClose = true;
    const id = this.currentId;
    this.currentId = undefined;
    document.title = this.baseTitle;

    if (updateHistory) {
      const action = closeAction(
        readCardState(history.state),
        localeHome(this.locale),
      );
      if (action.kind === 'back') history.go(-action.steps);
      else history.replaceState(null, '', action.url);
    }

    const target =
      this.returnTo?.isConnected === true
        ? this.returnTo
        : this.fallbackFocus();
    this.returnTo = null;
    target?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('card:close', { detail: { id } }));
  }
}

function isModified(event: MouseEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

let controller: CardController | undefined;

function getController(
  items: readonly CardItem[],
  locale: Locale,
  fallbackFocus: () => HTMLElement | null = () => null,
): CardController {
  controller ??= new CardController(items, locale, fallbackFocus);
  return controller;
}

/**
 * Wires the card to the page: link interception, back/forward, and opening
 * the card when the page itself is an item URL (`/es/proyectos/<id>/`).
 */
export function startCards(
  items: readonly CardItem[],
  locale: Locale,
  fallbackFocus: () => HTMLElement | null,
): void {
  getController(items, locale, fallbackFocus).syncWithLocation('land');
}

/** Opens an item's card and moves the URL to its page. */
export function openCard(
  id: string,
  items: readonly CardItem[],
  locale: Locale,
): boolean {
  return getController(items, locale).open(id);
}

export function closeCard(): void {
  controller?.close();
}
