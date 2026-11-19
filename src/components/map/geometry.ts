/**
 * Geometry of the map: the two canvases (desktop and mobile), node shapes,
 * curved connections and label placement. Coordinates are SVG user units
 * (the `viewBox`), not CSS pixels: the SVG scales to its box like a vector
 * drawable does on Android.
 */
import type { Layout } from './model';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Canvas {
  readonly width: number;
  readonly height: number;
}

/** A tall, narrow canvas: the tree grows upwards through time. */
export const CANVAS: Record<Layout, Canvas> = {
  desktop: { width: 720, height: 1000 },
  mobile: { width: 340, height: 880 },
};

const round = (n: number) => Math.round(n * 10) / 10;

/** Node radius grows with importance (1–5); a bit bigger on touch screens. */
export function nodeRadius(importance: number, layout: Layout): number {
  const clamped = Math.min(5, Math.max(1, importance));
  return 2.6 + clamped * 1.25 + (layout === 'mobile' ? 1 : 0);
}

const n = (value: number) => String(round(value));

/**
 * A curved edge from `a` to `b`: a quadratic Bézier whose control point sits
 * on the perpendicular through the midpoint, `bend × length` away. The bend
 * always goes to the same side of a→b, and edges come with `source <
 * target`, so the drawing is the same in every build.
 */
export function curvePath(a: Point, b: Point, bend = 0.18): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return `M${n(a.x)},${n(a.y)}`;
  const cx = (a.x + b.x) / 2 - (dy / length) * length * bend;
  const cy = (a.y + b.y) / 2 + (dx / length) * length * bend;
  return `M${n(a.x)},${n(a.y)}Q${n(cx)},${n(cy)} ${n(b.x)},${n(b.y)}`;
}

// ---------- Labels ----------

export const LABEL_FONT_SIZE = 11;
/** JetBrains Mono advance width is 0.6 em. */
const CHAR_WIDTH = LABEL_FONT_SIZE * 0.6;
const LABEL_HEIGHT = LABEL_FONT_SIZE + 4;
const MAX_LABEL_CHARS = 26;

/** Labels are short: the full title is in the node's accessible name. */
/** Roots have few labels and long names (universities), so more room. */
export const ROOT_LABEL_CHARS = 40;

export function labelText(title: string, max = MAX_LABEL_CHARS): string {
  return title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
}

export type Anchor = 'start' | 'middle' | 'end';

/** Label position relative to its node, as SVG `<text>` attributes. */
export interface LabelPlacement {
  readonly dx: number;
  readonly dy: number;
  readonly anchor: Anchor;
}

export interface Box {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

const overlaps = (a: Box, b: Box) =>
  a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

export interface LabelInput {
  readonly id: string;
  readonly text: string;
  readonly at: Point;
  readonly r: number;
  /** Labels shown at rest are placed first and avoid each other. */
  readonly atRest: boolean;
  /** Side tried first: the side its branch grows towards (default right). */
  readonly side?: -1 | 1;
}

/** Outward side first, then the other side, above, below. */
function candidates(r: number, side: -1 | 1 = 1): LabelPlacement[] {
  const gap = round(r + 5);
  const right: LabelPlacement = { dx: gap, dy: 4, anchor: 'start' };
  const left: LabelPlacement = { dx: -gap, dy: 4, anchor: 'end' };
  return [
    ...(side === 1 ? [right, left] : [left, right]),
    { dx: 0, dy: -round(r + 7), anchor: 'middle' },
    { dx: 0, dy: round(r + LABEL_FONT_SIZE + 3), anchor: 'middle' },
  ];
}

/** Box of a text of `chars` characters whose baseline starts at `x, y`. */
export function textBox(
  chars: number,
  x: number,
  baseline: number,
  anchor: Anchor,
  fontSize = LABEL_FONT_SIZE,
): Box {
  const w = chars * fontSize * 0.6;
  const x1 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x1, x2: x1 + w, y1: baseline - fontSize, y2: baseline + 4 };
}

function boxOf(label: LabelInput, place: LabelPlacement): Box {
  const w = label.text.length * CHAR_WIDTH;
  const x = label.at.x + place.dx;
  const x1 =
    place.anchor === 'start' ? x : place.anchor === 'end' ? x - w : x - w / 2;
  const baseline = label.at.y + place.dy;
  return { x1, x2: x1 + w, y1: baseline - LABEL_HEIGHT + 4, y2: baseline + 4 };
}

/** Where a label goes, and whether it stays visible at rest. */
export interface PlacedLabel extends LabelPlacement {
  readonly atRest: boolean;
}

/**
 * Greedy label placement. Labels meant to show at rest go first: each tries
 * right, left, above and below, and takes the first spot inside the canvas
 * that doesn't hit another label or a node. One that doesn't fit anywhere
 * only shows on focus (`atRest: false`). Then the other labels (shown on
 * focus, a few at a time) try the same spots; if none is free they take the
 * first spot inside the canvas, overlapping if they must.
 */
export function placeLabels(
  labels: readonly LabelInput[],
  canvas: Canvas,
  obstacles: readonly Box[] = [],
): Map<string, PlacedLabel> {
  const result = new Map<string, PlacedLabel>();
  const nodes: (Box & { id: string })[] = labels.map((l) => ({
    id: l.id,
    x1: l.at.x - l.r,
    x2: l.at.x + l.r,
    y1: l.at.y - l.r,
    y2: l.at.y + l.r,
  }));
  const taken: Box[] = [...obstacles];
  const inside = (b: Box) =>
    b.x1 >= 2 &&
    b.y1 >= 2 &&
    b.x2 <= canvas.width - 2 &&
    b.y2 <= canvas.height - 2;
  const freeSpot = (label: LabelInput) =>
    candidates(label.r, label.side).find((place) => {
      const box = boxOf(label, place);
      return (
        inside(box) &&
        !taken.some((t) => overlaps(t, box)) &&
        !nodes.some((nb) => nb.id !== label.id && overlaps(nb, box))
      );
    });

  const rest = labels.filter((l) => l.atRest);
  const onFocus = labels.filter((l) => !l.atRest);
  for (const label of [...rest, ...onFocus]) {
    const spot = freeSpot(label);
    if (spot) {
      taken.push(boxOf(label, spot));
      result.set(label.id, { ...spot, atRest: label.atRest });
    }
  }
  // No free spot: the first one inside the canvas, even if it overlaps.
  for (const label of labels) {
    if (result.has(label.id)) continue;
    const spots = candidates(label.r, label.side);
    const place = spots.find((spot) => inside(boxOf(label, spot))) ?? spots[0];
    if (place) result.set(label.id, { ...place, atRest: false });
  }
  return result;
}
