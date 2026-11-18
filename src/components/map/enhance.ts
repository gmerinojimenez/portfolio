/**
 * Browser side of the map: progressive enhancement of the HTML that
 * `render.ts` produced (at build time or just now). Nothing is redrawn: this
 * only toggles classes and attributes, like changing a View's state instead
 * of inflating a new layout.
 *
 * - Hover or focus a node: its connections show, the rest dims, the panel
 *   lists its related items.
 * - Click (or Enter on the focused link) pins it; the card controller (S05)
 *   opens the card because nodes are `a[data-card-open]` links.
 * - Legend buttons filter by type and topic.
 */
import type { CardItem } from '../card/model';
import type { UiStrings } from '../../i18n/ui';
import {
  isFiltering,
  neighborsOf,
  NO_FILTER,
  shownEdges,
  toggleFilter,
  visibleIds,
  type MapFilter,
} from './filters';
import { buildMapModel, type MapData } from './model';
import { renderPanel } from './render';

export function enhanceMap(
  output: HTMLElement,
  data: MapData,
  items: readonly CardItem[],
  t: UiStrings,
): void {
  const found = output.querySelector<HTMLElement>('[data-map]');
  if (!found) return;
  const root: HTMLElement = found;
  const model = buildMapModel(data, items);
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  const nodeEls = [...root.querySelectorAll<SVGAElement>('[data-node]')];
  const edgeEls = [...root.querySelectorAll<SVGPathElement>('[data-edge]')];
  const filterEls = [
    ...root.querySelectorAll<HTMLButtonElement>('[data-filter]'),
  ];
  const panel = root.querySelector<HTMLElement>('[data-map-panel]');

  let filter: MapFilter = NO_FILTER;
  let hovered: string | null = null;
  let focused: string | null = null;
  let pinned: string | null = null;
  let panelFor: string | null = null;

  const nodeIdOf = (target: EventTarget | null) =>
    (target instanceof Element
      ? target.closest<SVGElement>('[data-node]')?.dataset.node
      : undefined) ?? null;

  function apply(): void {
    const visible = visibleIds(model.nodes, filter);
    if (pinned && !visible.has(pinned)) pinned = null;
    const candidate = hovered ?? focused ?? pinned;
    const active = candidate && visible.has(candidate) ? candidate : null;
    const linked = new Set(
      active
        ? [active, ...neighborsOf(model.edges, active)].filter((id) =>
            visible.has(id),
          )
        : [],
    );
    const shown = shownEdges(model.edges, active, visible);

    root.classList.toggle('is-focusing', active !== null);
    root.classList.toggle('is-filtering', isFiltering(filter));
    for (const el of nodeEls) {
      const id = el.dataset.node ?? '';
      const out = !visible.has(id);
      el.classList.toggle('is-out', out);
      el.classList.toggle('is-active', id === active);
      el.classList.toggle('is-pinned', id === pinned);
      el.classList.toggle('is-linked', linked.has(id));
      // Filtered-out nodes leave the tab order and the accessibility tree.
      if (out) {
        el.setAttribute('tabindex', '-1');
        el.setAttribute('aria-hidden', 'true');
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-hidden');
      }
    }
    for (const el of edgeEls) {
      const key = el.dataset.edge ?? '';
      el.classList.toggle('is-shown', shown.has(key));
      el.classList.toggle('is-hot', active !== null && shown.has(key));
    }
    for (const button of filterEls) {
      const dimension =
        button.dataset.filter === 'types' ? 'types' : 'clusters';
      const set: ReadonlySet<string> = filter[dimension];
      button.setAttribute(
        'aria-pressed',
        String(set.has(button.dataset.value ?? '')),
      );
    }
    // The panel keeps the last node shown, so its links can be reached
    // with the mouse or Tab after leaving the node.
    if (active && active !== panelFor) updatePanel(active, visible);
  }

  function updatePanel(id: string | null, visible: ReadonlySet<string>): void {
    const node = id && visible.has(id) ? byId.get(id) : undefined;
    const related = node
      ? neighborsOf(model.edges, node.id)
          .filter((other) => visible.has(other))
          .flatMap((other) => byId.get(other) ?? [])
      : [];
    if (panel) panel.innerHTML = renderPanel(node ?? null, related, t).value;
    panelFor = node?.id ?? null;
  }

  root.addEventListener('pointerover', (event) => {
    const id = nodeIdOf(event.target);
    if (id !== hovered) {
      hovered = id;
      apply();
    }
  });
  root.addEventListener('pointerleave', () => {
    hovered = null;
    apply();
  });
  root.addEventListener('focusin', (event) => {
    focused = nodeIdOf(event.target);
    apply();
  });
  root.addEventListener('focusout', () => {
    focused = null;
    apply();
  });
  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const button = target.closest<HTMLButtonElement>('[data-filter]');
    if (button) {
      const dimension =
        button.dataset.filter === 'types' ? 'types' : 'clusters';
      filter = toggleFilter(filter, dimension, button.dataset.value ?? '');
      // Refresh the panel: its node or some of its links may be hidden now.
      updatePanel(panelFor, visibleIds(model.nodes, filter));
      apply();
      return;
    }
    // Clicking a node pins it (the card controller opens its card);
    // clicking the empty canvas unpins.
    if (target.closest('svg')) {
      pinned = nodeIdOf(target);
      apply();
    }
  });

  for (const button of filterEls) button.disabled = false;
  root.setAttribute('data-ready', '');
  apply();
}
