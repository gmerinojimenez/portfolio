/**
 * Geometry of the map: the two canvases (desktop and mobile), where each
 * cluster and node goes, node shapes, curved edges and label placement.
 * Coordinates are SVG user units (the `viewBox`), not CSS pixels: the SVG
 * scales to its box like a vector drawable does on Android.
 */
import type { ItemType } from '../../lib/content-schema';
import type { ClusterId, Layout, MapCluster, MapNode, Point } from './model';

export interface Canvas {
  readonly width: number;
  readonly height: number;
}

export const CANVAS: Record<Layout, Canvas> = {
  desktop: { width: 720, height: 440 },
  mobile: { width: 340, height: 520 },
};

/** Desktop margin around the unit square, so regions aren't cut off. */
const DESKTOP_PAD = 28;

/**
 * Mobile is a vertical canvas with its own fixed centers: Android at the
 * top, Cloud on the right, AI at the bottom, Fundamentals on the left.
 */
const MOBILE_CENTERS: Record<ClusterId, Point> = {
  android: { x: 160, y: 108 },
  cloud: { x: 252, y: 262 },
  ai: { x: 160, y: 412 },
  fundamentals: { x: 78, y: 262 },
};

/** Mobile radius of a cluster whose desktop radius is the reference (0.17). */
const MOBILE_RADIUS = 72;
const REFERENCE_RADIUS = 0.17;

const round = (n: number) => Math.round(n * 10) / 10;

/** Desktop: the unit square scaled into the canvas, inside a margin. */
export function toDesktop(p: Point): Point {
  const { width, height } = CANVAS.desktop;
  return {
    x: round(DESKTOP_PAD + p.x * (width - 2 * DESKTOP_PAD)),
    y: round(DESKTOP_PAD + p.y * (height - 2 * DESKTOP_PAD)),
  };
}

/** Cluster center and radii (an ellipse on desktop, a circle on mobile). */
export function clusterShape(
  cluster: MapCluster,
  layout: Layout,
): { center: Point; rx: number; ry: number } {
  if (layout === 'mobile') {
    const r = round((cluster.radius / REFERENCE_RADIUS) * MOBILE_RADIUS);
    return { center: MOBILE_CENTERS[cluster.id], rx: r, ry: r };
  }
  const { width, height } = CANVAS.desktop;
  return {
    center: toDesktop(cluster.center),
    rx: round(cluster.radius * (width - 2 * DESKTOP_PAD)),
    ry: round(cluster.radius * (height - 2 * DESKTOP_PAD)),
  };
}

/** Where a node goes: `x, y` on desktop, `center + local × radius` on mobile. */
export function nodePosition(
  node: Pick<MapNode, 'desktop' | 'local'>,
  cluster: MapCluster,
  layout: Layout,
): Point {
  if (layout === 'desktop') return toDesktop(node.desktop);
  const { center, rx } = clusterShape(cluster, 'mobile');
  return {
    x: round(center.x + node.local.x * rx),
    y: round(center.y + node.local.y * rx),
  };
}

/** Node radius grows with importance (1–5); a bit bigger on touch screens. */
export function nodeRadius(importance: number, layout: Layout): number {
  const clamped = Math.min(5, Math.max(1, importance));
  return 4 + clamped * 1.4 + (layout === 'mobile' ? 1 : 0);
}

const n = (value: number) => String(round(value));

/**
 * SVG path of a node's shape centered on 0,0: ○ app and ◎ project are
 * circles (the project gets an inner dot when drawn), □ education,
 * ◇ library, △ post. Polygons are a bit bigger than `r` so every shape
 * looks about the same size as a circle of radius `r`.
 */
export function shapePath(type: ItemType, r: number): string {
  switch (type) {
    case 'education': {
      const s = r * 0.9;
      return `M${n(-s)},${n(-s)}H${n(s)}V${n(s)}H${n(-s)}Z`;
    }
    case 'post': {
      const s = r * 1.2;
      return `M0,${n(-s)}L${n(s)},${n(s * 0.7)}L${n(-s)},${n(s * 0.7)}Z`;
    }
    case 'oss': {
      const s = r * 1.25;
      return `M0,${n(-s)}L${n(s)},0L0,${n(s)}L${n(-s)},0Z`;
    }
    default:
      return `M${n(-r)},0A${n(r)},${n(r)} 0 1,0 ${n(r)},0A${n(r)},${n(r)} 0 1,0 ${n(-r)},0Z`;
  }
}

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

export const LABEL_FONT_SIZE = 12;
/** JetBrains Mono advance width is 0.6 em. */
const CHAR_WIDTH = LABEL_FONT_SIZE * 0.6;
const LABEL_HEIGHT = LABEL_FONT_SIZE + 4;
const MAX_LABEL_CHARS = 26;

/** Labels are short: the full title is in the node's accessible name. */
export function labelText(title: string): string {
  return title.length > MAX_LABEL_CHARS
    ? `${title.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`
    : title;
}

export type Anchor = 'start' | 'middle' | 'end';

/** Label position relative to its node, as SVG `<text>` attributes. */
export interface LabelPlacement {
  readonly dx: number;
  readonly dy: number;
  readonly anchor: Anchor;
}

interface Box {
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
}

/** Right, left, above, below. */
function candidates(r: number): LabelPlacement[] {
  const gap = round(r + 5);
  return [
    { dx: gap, dy: 4, anchor: 'start' },
    { dx: -gap, dy: 4, anchor: 'end' },
    { dx: 0, dy: -round(r + 7), anchor: 'middle' },
    { dx: 0, dy: round(r + LABEL_FONT_SIZE + 3), anchor: 'middle' },
  ];
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
): Map<string, PlacedLabel> {
  const result = new Map<string, PlacedLabel>();
  const nodes: (Box & { id: string })[] = labels.map((l) => ({
    id: l.id,
    x1: l.at.x - l.r,
    x2: l.at.x + l.r,
    y1: l.at.y - l.r,
    y2: l.at.y + l.r,
  }));
  const taken: Box[] = [];
  const inside = (b: Box) =>
    b.x1 >= 2 &&
    b.y1 >= 2 &&
    b.x2 <= canvas.width - 2 &&
    b.y2 <= canvas.height - 2;
  const freeSpot = (label: LabelInput) =>
    candidates(label.r).find((place) => {
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
    const spots = candidates(label.r);
    const place = spots.find((spot) => inside(boxOf(label, spot))) ?? spots[0];
    if (place) result.set(label.id, { ...place, atRest: false });
  }
  return result;
}
