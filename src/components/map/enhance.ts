/**
 * Browser side of the map: progressive enhancement of the HTML that
 * `render.ts` produced (at build time or just now). Nothing is redrawn: this
 * only toggles classes and attributes, like changing a View's state instead
 * of inflating a new layout.
 *
 * - Hover or focus a node: its path down to the trunk, its children and its
 *   related items stay lit, the rest dims, and its `related` connections
 *   show; the panel lists its connections.
 * - Click (or Enter on the focused link) pins it; the card controller (S05)
 *   opens the card because nodes are `a[data-card-open]` links.
 * - Legend buttons filter by type and topic; "replay" grows the tree again.
 */
import type { UiStrings } from '../../i18n/ui';
import type { ConsoleData } from '../console/data';
import {
  connectionsOf,
  isFiltering,
  NO_FILTER,
  pathSet,
  shownEdges,
  toggleFilter,
  visibleIds,
  type MapFilter,
} from './filters';
import { buildTreeModel, type MapModel } from './model';
import { renderPanel } from './render';

export function enhanceMap(
  output: HTMLElement,
  data: Pick<ConsoleData, 'items' | 'stages'>,
  t: UiStrings,
  /** The model the HTML was drawn from, when it isn't the default one. */
  drawn?: MapModel,
): void {
  const found = output.querySelector<HTMLElement>('[data-map]');
  if (!found) return;
  const root: HTMLElement = found;
  const model = drawn ?? buildTreeModel(data.items, data.stages, t);
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  const nodeEls = [...root.querySelectorAll<SVGAElement>('[data-node]')];
  const anchorEls = [...root.querySelectorAll<SVGGElement>('[data-anchor]')];
  const branchEls = [...root.querySelectorAll<SVGPathElement>('[data-branch]')];
  const edgeEls = [...root.querySelectorAll<SVGPathElement>('[data-edge]')];
  const filterEls = [
    ...root.querySelectorAll<HTMLButtonElement>('[data-filter]'),
  ];
  const replay = root.querySelector<HTMLButtonElement>('[data-map-replay]');
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
    const path = active ? pathSet(model, active) : new Set<string>();
    const linked = new Set(
      active
        ? [...path, ...connectionsOf(model, active)].filter(
            (id) => visible.has(id) || model.tree.get(id)?.kind !== 'item',
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
    for (const el of anchorEls) {
      el.classList.toggle('is-linked', path.has(el.dataset.anchor ?? ''));
    }
    for (const el of branchEls) {
      const id = el.dataset.branch ?? '';
      el.classList.toggle('is-linked', path.has(id));
      el.classList.toggle(
        'is-out',
        model.tree.get(id)?.kind === 'item' && !visible.has(id),
      );
    }
    for (const el of edgeEls) {
      el.classList.toggle('is-shown', shown.has(el.dataset.edge ?? ''));
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
      ? connectionsOf(model, node.id)
          .filter((other) => visible.has(other))
          .flatMap((other) => byId.get(other) ?? [])
      : [];
    if (panel) panel.innerHTML = renderPanel(node ?? null, related, t).value;
    panelFor = node?.id ?? null;
  }

  /** Restarts the CSS growth animation. */
  function regrow(): void {
    root.classList.add('is-restarting');
    void root.getBoundingClientRect(); // flush styles so the animation resets
    root.classList.remove('is-restarting');
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
    if (target.closest('[data-map-replay]')) {
      regrow();
      return;
    }
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
  if (replay) replay.disabled = false;
  root.setAttribute('data-ready', '');
  apply();
}
