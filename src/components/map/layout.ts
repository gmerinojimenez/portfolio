/**
 * Where everything in the career tree goes, for one canvas (desktop or
 * mobile), and when it grows. Deterministic: the same model always gives
 * the same drawing, so the build-time HTML and a `map` typed in the browser
 * match. Ported from the prototype in docs/design/prototypes/map-tree.
 *
 * - y is time: the trunk runs from the first stage (bottom) to "now" (top).
 *   The roots below the ground are ordered by date but not to scale.
 * - First-level branches alternate sides. While the personal stem exists it
 *   owns the right side, so work branches from then on grow to the left.
 * - Long-lived items with children become boughs that run alongside the
 *   trunk; their children sprout from them.
 * - Growth: everything appears bottom to top. Delays are in seconds, for
 *   CSS `animation-delay`.
 */
import { CANVAS, nodeRadius, type Canvas, type Point } from './geometry';
import {
  ROOTS_SECTION,
  STEM_ID,
  byStageOrder,
  type ClusterId,
  type Layout,
  type MapModel,
  type TreeNode,
} from './model';

export type { Point };

export interface PlacedNode extends Point {
  readonly r: number;
  /** -1 left of its parent, 1 right. */
  readonly side: -1 | 1;
  /** Seconds before it pops in. */
  readonly delay: number;
}

export type StrokeKind =
  'root' | 'branch' | 'sprout' | 'item' | 'bough' | 'stem';

/** A path that draws itself in: dash offset from `length` to 0. */
export interface Stroke {
  /** Child node id (or the bough's owner). */
  readonly id: string;
  readonly kind: StrokeKind;
  readonly d: string;
  readonly length: number;
  readonly delay: number;
  readonly duration: number;
  readonly cluster: ClusterId;
}

export interface TreeLayout {
  readonly canvas: Canvas;
  readonly nodes: ReadonlyMap<string, PlacedNode>;
  readonly strokes: readonly Stroke[];
  readonly trunk: {
    readonly d: string;
    readonly length: number;
    readonly delay: number;
    readonly duration: number;
    /** Gradient stops, bottom (0) to top (1). */
    readonly stops: readonly { offset: number; cluster: ClusterId }[];
    readonly y1: number;
    readonly y2: number;
  } | null;
  readonly groundY: number;
  /** Where the roots meet the trunk (the education badge). */
  readonly ground: Point;
  /** When the trunk starts growing (seconds). */
  readonly groundDelay: number;
  readonly years: readonly { y: number; label: string }[];
  /** Which side of its node each stage's label goes. */
  readonly stageLabelSide: ReadonlyMap<string, -1 | 1>;
}

const DURATION = 4.2;
/** Share of the trunk's height for the last `RECENT_YEARS` years. */
const RECENT_SHARE = 0.36;
const RECENT_YEARS = 3.4;
const MIN_STROKE = 0.42;
const PARENT_GAP = 0.26;

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const P = (p: Point) => `${r1(p.x)},${r1(p.y)}`;

// ---------------------------------------------------------------- paths

type Cubic = [Point, Point, Point, Point];

function cubicAt([a, b, c, d]: Cubic, t: number): Point {
  const u = 1 - t;
  return {
    x:
      u * u * u * a.x +
      3 * u * u * t * b.x +
      3 * u * t * t * c.x +
      t * t * t * d.x,
    y:
      u * u * u * a.y +
      3 * u * u * t * b.y +
      3 * u * t * t * c.y +
      t * t * t * d.y,
  };
}

/** Length of a cubic Bézier, by sampling (plenty for a dash animation). */
function cubicLength(curve: Cubic): number {
  let length = 0;
  let prev = curve[0];
  for (let i = 1; i <= 24; i++) {
    const p = cubicAt(curve, i / 24);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return length;
}

function cubicPath(curves: readonly Cubic[]): { d: string; length: number } {
  if (curves.length === 0) return { d: '', length: 0 };
  const d =
    `M${P(curves[0]![0])}` +
    curves.map(([, b, c, e]) => `C${P(b)} ${P(c)} ${P(e)}`).join('');
  const length = curves.reduce((sum, c) => sum + cubicLength(c), 0);
  return { d, length: Math.ceil(length) + 1 };
}

/** A smooth curve through `points` (Catmull-Rom as cubic Béziers). */
function smooth(points: readonly Point[]): Cubic[] {
  const curves: Cubic[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    curves.push([
      p1,
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    ]);
  }
  return curves;
}

// ---------------------------------------------------------------- layout

interface Mutable {
  id: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  r: number;
  side: -1 | 1;
  fixed: boolean;
}

export function layoutTree(model: MapModel, layout: Layout): TreeLayout {
  const canvas = CANVAS[layout];
  const { width: W, height: H } = canvas;
  const mobile = layout === 'mobile';
  const tree = model.tree;
  const all = [...tree.values()];
  const get = (id: string) => tree.get(id)!;

  const stages = all.filter((n) => n.kind === 'stage').sort(byStageOrder);
  const stem = tree.get(STEM_ID) ?? null;
  const rootsTop = all.filter(
    (n) => n.section === ROOTS_SECTION && n.parent === null,
  );
  const hasRoots = rootsTop.length > 0;

  // ---- Vertical: time above the ground, order below it.
  const top = mobile ? 34 : 38;
  const bottom = 14;
  const rootShare = hasRoots ? 0.3 : 0;
  const groundY = r1(top + (H - top - bottom) * (1 - rootShare));
  const now = model.now;
  const tWork = stages[0]?.t ?? stem?.t ?? now - 1;
  const tLow = tWork - 0.35;
  const tHigh = now + 0.15;
  const trunkBase = groundY - 16;
  // The last few years get more room: that's where a visitor looks first,
  // and where most of the recent work is.
  const knot = Math.max(tLow + 1, tHigh - RECENT_YEARS);
  const fraction = (t: number) => {
    const v = Math.min(t, tHigh);
    return v <= knot
      ? (1 - RECENT_SHARE) * ((v - tLow) / (knot - tLow))
      : 1 - RECENT_SHARE + RECENT_SHARE * ((v - knot) / (tHigh - knot));
  };
  const y = (t: number) => trunkBase - fraction(t) * (trunkBase - top);

  // ---- Horizontal: the trunk, and the stem to its right.
  const cx = r1(stem ? W * (mobile ? 0.5 : 0.52) : W / 2);
  const stemX = r1(cx + (W - cx) * 0.5);
  const step = Math.min(110, (cx - 24) / 3.2);
  const margin = mobile ? 14 : 20;
  const leftOnly = (n: TreeNode) =>
    stem !== null && n.kind === 'stage' && (n.t1 ?? n.t) > stem.t;

  const childrenOf = (n: TreeNode) =>
    n.children.map(get).sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));

  // ---- Sides.
  const side = new Map<string, -1 | 1>();
  let alt: -1 | 1 = -1;
  for (const stage of stages) {
    for (const child of childrenOf(stage)) {
      if (leftOnly(stage)) side.set(child.id, -1);
      else {
        side.set(child.id, alt);
        alt = alt === -1 ? 1 : -1;
      }
    }
  }
  if (stem) {
    let own: -1 | 1 = 1;
    for (const child of childrenOf(stem)) {
      side.set(child.id, own);
      own = own === -1 ? 1 : -1;
    }
  }
  let rootAlt: -1 | 1 = -1;
  for (const root of [...rootsTop].sort(
    (a, b) => a.t - b.t || a.id.localeCompare(b.id),
  )) {
    side.set(root.id, rootAlt);
    rootAlt = rootAlt === -1 ? 1 : -1;
  }
  const inherit = (n: TreeNode, s: -1 | 1) => {
    for (const c of n.children.map(get)) {
      side.set(c.id, s);
      inherit(c, s);
    }
  };
  for (const n of all) {
    if (n.parent === null && side.has(n.id)) inherit(n, side.get(n.id)!);
    if (n.depth === 1 && n.parent !== null) inherit(n, side.get(n.id) ?? 1);
  }
  const sideOf = (id: string): -1 | 1 => side.get(id) ?? 1;

  // ---- Targets.
  const radius = (n: TreeNode) => {
    if (n.kind === 'stage' || n.kind === 'stem') return mobile ? 12 : 13;
    if (n.badge) return 10;
    return nodeRadius(n.importance, layout);
  };
  const placed = new Map<string, Mutable>();
  const put = (n: TreeNode, x: number, yy: number, fixed = false) => {
    const tx = Math.max(margin, Math.min(W - margin, x));
    placed.set(n.id, {
      id: n.id,
      tx,
      ty: yy,
      x: tx,
      y: yy,
      r: radius(n),
      side: sideOf(n.id),
      fixed,
    });
  };

  // Stages on the trunk, at least a badge apart (same-year starts).
  let prevY = Number.POSITIVE_INFINITY;
  const gap = mobile ? 30 : 34;
  for (const stage of stages) {
    const sy = Math.min(y(stage.t), prevY - gap);
    put(stage, cx, sy, true);
    prevY = sy;
  }
  // The stem's badge sits at its start; its items grow above it, on both
  // sides of its own little trunk.
  const stemY = stem ? Math.max(top + 30, y(stem.t)) : 0;
  const sproutY = stemY + (mobile ? 16 : 20);
  if (stem) put(stem, stemX, stemY, true);
  const stemOffset = mobile ? 30 : 46;
  const placeChildren = (n: TreeNode) => {
    const p = placed.get(n.id)!;
    for (const c of childrenOf(n)) {
      const s = sideOf(c.id);
      let x: number;
      let cy = y(c.t);
      if (n.kind === 'stem') {
        x = p.tx + s * stemOffset;
        cy = Math.min(cy, stemY - (mobile ? 22 : 26));
      } else if (n.kind === 'stage') x = p.tx + s * step;
      else x = p.tx + s * step * 0.85;
      put(c, x, cy);
      placeChildren(c);
    }
  };

  // Roots: ordered by date, oldest deepest, not to scale.
  const rootOrder = [...rootsTop].sort(
    (a, b) => a.t - b.t || a.id.localeCompare(b.id),
  );
  const rootLow = H - bottom - (mobile ? 16 : 18);
  const rootHigh = groundY + (mobile ? 58 : 66);
  rootOrder.forEach((root, k) => {
    const ry =
      rootOrder.length === 1
        ? (rootLow + rootHigh) / 2
        : rootLow - ((rootLow - rootHigh) * k) / (rootOrder.length - 1);
    put(root, cx + sideOf(root.id) * step * 0.9, ry);
    // Certificates fan out around their group.
    const kids = childrenOf(root);
    kids.forEach((c, j) => {
      const dy = (j - (kids.length - 1) / 2) * (mobile ? 9 : 10);
      put(c, cx + sideOf(root.id) * step * (1.6 + (j % 2) * 0.35), ry + dy);
    });
  });
  for (const stage of stages) placeChildren(stage);
  if (stem) placeChildren(stem);
  // Children of groups were placed with their group; deeper ones too.

  // ---- Stage labels go opposite their first branch (right while the stem
  // owns the right side, since branches then grow left).
  // With branches on both sides, the side with more free room at the
  // label's height wins.
  const clearance = (stage: TreeNode, s: -1 | 1) => {
    const at = placed.get(stage.id)!;
    let room = Number.POSITIVE_INFINITY;
    for (const n of all) {
      if (n.kind === 'stage' || n.kind === 'stem') continue;
      const m = placed.get(n.id)!;
      const dx = (m.x - at.x) * s;
      if (dx > 0 && Math.abs(m.y - at.y) < 16) room = Math.min(room, dx);
    }
    return room;
  };
  const stageLabelSide = new Map<string, -1 | 1>();
  for (const stage of stages) {
    const first = childrenOf(stage)[0];
    const fallback: -1 | 1 = first && sideOf(first.id) === 1 ? -1 : 1;
    const right = clearance(stage, 1);
    const left = clearance(stage, -1);
    const s: -1 | 1 = leftOnly(stage)
      ? 1
      : right === left
        ? fallback
        : right > left
          ? 1
          : -1;
    stageLabelSide.set(stage.id, s);
  }

  // Stage labels are obstacles too: nodes move out of their way.
  // Stage titles are 12px (map.css), wider than node labels.
  const charW = 12 * 0.62;
  const labelBoxes = stages.map((stage) => {
    const at = placed.get(stage.id)!;
    const side = stageLabelSide.get(stage.id)!;
    const near = at.x + side * (at.r + 4);
    const far = near + side * (Math.max(stage.title.length, 11) * charW + 10);
    return {
      x0: Math.min(near, far),
      x1: Math.max(near, far),
      y0: at.y - 13,
      y1: at.y + 16,
    };
  });

  const hits = (
    m: { r: number },
    x: number,
    y: number,
    b: (typeof labelBoxes)[number],
  ) => x + m.r > b.x0 && x - m.r < b.x1 && y + m.r > b.y0 && y - m.r < b.y1;
  // ---- Collision relaxation (fixed order, fixed iterations).
  const movers = [...placed.values()].sort((a, b) => a.id.localeCompare(b.id));
  const pad = mobile ? 5 : 8;
  for (let iter = 0; iter < 160; iter++) {
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i]!;
        const b = movers[j]!;
        if (a.fixed && b.fixed) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.r + b.r + pad;
        if (d >= min) continue;
        if (d < 0.01) {
          dx = b.side;
          dy = 0;
          d = 1;
        }
        const push = (min - d) / (a.fixed || b.fixed ? 1 : 2);
        const ux = dx / d;
        const uy = dy / d;
        if (!a.fixed) {
          a.x -= ux * push;
          a.y -= uy * push;
        }
        if (!b.fixed) {
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
    for (const m of movers) {
      if (m.fixed) continue;
      m.x += (m.tx - m.x) * 0.06;
      m.y += (m.ty - m.y) * 0.18;
      m.x = Math.max(margin, Math.min(W - margin, m.x));
      m.y = Math.max(top - 10, Math.min(H - bottom, m.y));
      for (const b of labelBoxes) {
        if (!hits(m, m.x, m.y, b)) continue;
        // Smallest move (up, down or away from the trunk) that clears
        // every label; away from the trunk always does.
        const out = m.x < cx ? b.x0 - m.r - 1 - m.x : b.x1 + m.r + 1 - m.x;
        const moves = [
          { dx: 0, dy: b.y0 - m.r - 1 - m.y },
          { dx: 0, dy: b.y1 + m.r + 1 - m.y },
          { dx: out, dy: 0 },
        ].sort((p, q) => Math.hypot(p.dx, p.dy) - Math.hypot(q.dx, q.dy));
        const move =
          moves.find(
            (v) => !labelBoxes.some((o) => hits(m, m.x + v.dx, m.y + v.dy, o)),
          ) ?? moves.find((v) => v.dx !== 0)!;
        m.x += move.dx;
        m.y += move.dy;
      }
    }
  }

  // ---- Trunk.
  const ground: Point = { x: cx, y: groundY + (mobile ? 22 : 26) };
  const tip: Point = { x: cx, y: top - 16 };
  const trunkPts: Point[] = stages.length
    ? [
        ground,
        ...stages.map((s) => placed.get(s.id)!).sort((a, b) => b.y - a.y),
        tip,
      ]
    : [];
  const xAtY = (v: number) => {
    for (let i = 0; i < trunkPts.length - 1; i++) {
      const p = trunkPts[i]!;
      const q = trunkPts[i + 1]!;
      if (v <= p.y && v >= q.y) {
        return p.y === q.y
          ? p.x
          : p.x + ((v - p.y) / (q.y - p.y)) * (q.x - p.x);
      }
    }
    return cx;
  };

  // ---- Growth timing.
  const yBottom = H - bottom;
  const yTop = tip.y;
  const appearAt = (v: number) =>
    0.2 + ((yBottom - Math.min(yBottom, v)) / (yBottom - yTop)) * DURATION;
  const appear = new Map<string, number>();
  const byDepth = [...all].sort(
    (a, b) => a.depth - b.depth || a.id.localeCompare(b.id),
  );
  for (const n of byDepth) {
    const p = placed.get(n.id)!;
    let at = appearAt(p.y);
    if (n.kind === 'stem') at = Math.max(at, appearAt(sproutY) + MIN_STROKE);
    else if (n.parent !== null)
      at = Math.max(at, (appear.get(n.parent) ?? 0) + PARENT_GAP);
    appear.set(n.id, r2(at));
  }
  const trunkStart = appearAt(ground.y);
  const trunkEnd = appearAt(tip.y);

  // ---- Boughs.
  interface Bough {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  const boughs = new Map<string, Bough>();
  for (const n of all) {
    const p = placed.get(n.id)!;
    if (n.kind === 'stem') {
      boughs.set(n.id, { x0: p.x, y0: p.y, x1: p.x + 4, y1: tip.y + 12 });
    } else if (
      n.kind === 'item' &&
      n.section !== ROOTS_SECTION &&
      n.children.length > 0 &&
      n.t1 !== null &&
      n.t1 - n.t > 1.5
    ) {
      boughs.set(n.id, {
        x0: p.x,
        y0: p.y,
        x1: p.x + p.side * 14,
        y1: Math.max(tip.y + 12, Math.min(p.y - 30, y(n.t1))),
      });
    }
  }

  // ---- Strokes.
  const strokes: Stroke[] = [];
  const add = (
    id: string,
    kind: StrokeKind,
    curves: Cubic[],
    start: number,
    end: number,
    cluster: ClusterId,
  ) => {
    const { d, length } = cubicPath(curves);
    let s = start;
    if (end - s < MIN_STROKE) s = end - MIN_STROKE;
    s = Math.max(0, s);
    strokes.push({
      id,
      kind,
      d,
      length,
      delay: r2(s),
      duration: r2(Math.max(MIN_STROKE, end - s)),
      cluster,
    });
  };

  if (stem) {
    const s = placed.get(STEM_ID)!;
    const bx = stages.length ? xAtY(sproutY) : cx;
    const start = appearAt(sproutY);
    add(
      STEM_ID,
      'stem',
      [
        [
          { x: bx, y: sproutY },
          { x: bx + (s.x - bx) * 0.45, y: sproutY },
          { x: s.x - (s.x - bx) * 0.25, y: s.y + (sproutY - s.y) * 0.6 },
          { x: s.x - s.r * 0.7, y: s.y + s.r * 0.7 },
        ],
      ],
      start,
      appear.get(STEM_ID)!,
      stem.cluster,
    );
  }
  for (const [id, b] of boughs) {
    const n = get(id);
    const start = appear.get(id)!;
    add(
      id,
      n.kind === 'stem' ? 'stem' : 'bough',
      [
        [
          { x: b.x0, y: b.y0 },
          { x: b.x0 + (b.x1 - b.x0) * 0.2, y: b.y0 - (b.y0 - b.y1) * 0.4 },
          { x: b.x1, y: b.y1 + (b.y0 - b.y1) * 0.35 },
          { x: b.x1, y: b.y1 },
        ],
      ],
      start,
      Math.max(start + MIN_STROKE, appearAt(b.y1)),
      n.cluster,
    );
  }
  for (const n of all) {
    if (n.kind === 'stage' || n.kind === 'stem') continue;
    const c = placed.get(n.id)!;
    const end = appear.get(n.id)!;
    if (n.parent === null) {
      // A root: from its tip up to the ground.
      add(
        n.id,
        'root',
        [
          [
            { x: c.x, y: c.y },
            { x: c.x, y: c.y - (c.y - ground.y) * 0.6 },
            { x: ground.x, y: ground.y + (c.y - ground.y) * 0.45 },
            ground,
          ],
        ],
        end,
        Math.max(end + MIN_STROKE, trunkStart + 0.15),
        n.cluster,
      );
      continue;
    }
    const parent = get(n.parent);
    const p = placed.get(parent.id)!;
    const bough = boughs.get(parent.id);
    if (parent.kind === 'stage' || bough) {
      // Leaves the trunk (or bough) just below the child, then curves up.
      let sy: number;
      let sx: number;
      if (bough) {
        sy = Math.max(bough.y1, Math.min(bough.y0, c.y + 18));
        const f = (bough.y0 - sy) / (bough.y0 - bough.y1 || 1);
        sx = bough.x0 + (bough.x1 - bough.x0) * f;
      } else {
        sy = Math.min(p.y, c.y + 22);
        sx = xAtY(sy);
      }
      const dx = c.x - sx;
      add(
        n.id,
        bough ? 'sprout' : 'branch',
        [
          [
            { x: sx, y: sy },
            { x: sx + dx * 0.3, y: sy - 4 - (sy - c.y) * 0.4 },
            { x: sx + dx * 0.75, y: c.y + 2 },
            { x: c.x, y: c.y },
          ],
        ],
        appearAt(sy),
        end,
        n.cluster,
      );
    } else {
      const dx = c.x - p.x;
      add(
        n.id,
        'item',
        [
          [
            { x: p.x, y: p.y },
            { x: p.x + dx * 0.5, y: p.y + (c.y - p.y) * 0.1 },
            { x: p.x + dx * 0.8, y: c.y },
            { x: c.x, y: c.y },
          ],
        ],
        appear.get(parent.id)!,
        end,
        n.cluster,
      );
    }
  }
  strokes.sort(
    (a, b) =>
      a.delay - b.delay ||
      a.id.localeCompare(b.id) ||
      a.kind.localeCompare(b.kind),
  );

  // ---- Trunk path and colours by era.
  let trunk: TreeLayout['trunk'] = null;
  if (trunkPts.length) {
    const { d, length } = cubicPath(smooth(trunkPts));
    const stops = [
      { offset: 0, cluster: stages[0]!.cluster },
      ...stages.map((s) => ({
        offset: r2(
          Math.max(
            0,
            Math.min(1, (ground.y - placed.get(s.id)!.y) / (ground.y - tip.y)),
          ),
        ),
        cluster: s.cluster,
      })),
    ];
    trunk = {
      d,
      length,
      delay: r2(trunkStart),
      duration: r2(trunkEnd - trunkStart),
      stops,
      y1: r1(ground.y),
      y2: r1(tip.y),
    };
  }

  // ---- Year ticks above the ground.
  const years: { y: number; label: string }[] = [];
  // From now backwards, skipping a year that would sit too close to the
  // last one kept (the older part of the scale is denser).
  const minGap = mobile ? 20 : 16;
  for (let year = Math.floor(now); year >= Math.ceil(tLow); year--) {
    const yy = r1(y(year));
    const last = years[years.length - 1];
    if (last && yy - last.y < minGap) continue;
    years.push({ y: yy, label: String(year) });
  }

  const nodes = new Map<string, PlacedNode>();
  for (const n of all) {
    const m = placed.get(n.id)!;
    nodes.set(n.id, {
      x: r1(m.x),
      y: r1(m.y),
      r: m.r,
      side: m.side,
      delay: appear.get(n.id)!,
    });
  }
  return {
    canvas,
    nodes,
    strokes,
    trunk,
    groundY,
    ground: { x: r1(ground.x), y: r1(ground.y) },
    groundDelay: r2(Math.max(0, trunkStart - 0.3)),
    years,
    stageLabelSide,
  };
}
