import { describe, expect, it } from 'vitest';
import { useTranslations } from '../../i18n/ui';
import {
  isFiltering,
  matchesFilter,
  neighborsOf,
  NO_FILTER,
  shownEdges,
  toggleFilter,
  visibleIds,
} from './filters';
import {
  CANVAS,
  clusterShape,
  curvePath,
  labelText,
  nodePosition,
  nodeRadius,
  placeLabels,
  shapePath,
  toDesktop,
} from './geometry';
import {
  buildMapModel,
  countBy,
  labeledAtRest,
  tabOrder,
  type MapData,
} from './model';
import { nodeName, renderMap, renderPanel } from './render';

const data: MapData = {
  clusters: [
    {
      id: 'android',
      label: 'Android',
      center: { x: 0.24, y: 0.34 },
      radius: 0.17,
      count: 3,
    },
    {
      id: 'cloud',
      label: 'Cloud',
      center: { x: 0.74, y: 0.3 },
      radius: 0.17,
      count: 0,
    },
    {
      id: 'ai',
      label: 'IA',
      center: { x: 0.56, y: 0.76 },
      radius: 0.17,
      count: 1,
    },
    {
      id: 'fundamentals',
      label: 'Fundamentos',
      center: { x: 0.14, y: 0.78 },
      radius: 0.14,
      count: 1,
    },
  ],
  nodes: [
    {
      id: 'app',
      type: 'app',
      cluster: 'android',
      importance: 5,
      x: 0.3,
      y: 0.4,
      local: { x: 0.3, y: 0.3 },
    },
    {
      id: 'lib',
      type: 'oss',
      cluster: 'android',
      importance: 2,
      x: 0.2,
      y: 0.3,
      local: { x: -0.2, y: -0.2 },
    },
    {
      id: 'draft',
      type: 'post',
      cluster: 'android',
      importance: 3,
      x: 0.25,
      y: 0.2,
      local: { x: 0, y: -0.8 },
    },
    {
      id: 'post',
      type: 'post',
      cluster: 'ai',
      importance: 3,
      x: 0.6,
      y: 0.8,
      local: { x: 0.2, y: 0.4 },
    },
    {
      id: 'degree',
      type: 'education',
      cluster: 'fundamentals',
      importance: 2,
      x: 0.12,
      y: 0.84,
      local: { x: -0.1, y: 0.5 },
    },
  ],
  edges: [
    {
      source: 'app',
      target: 'draft',
      weight: 0.5,
      reasons: ['related'],
      bridge: false,
    },
    {
      source: 'app',
      target: 'lib',
      weight: 0.4,
      reasons: ['similarity'],
      bridge: false,
    },
    {
      source: 'app',
      target: 'post',
      weight: 0.3,
      reasons: ['related'],
      bridge: true,
    },
    {
      source: 'degree',
      target: 'lib',
      weight: 0.4,
      reasons: ['similarity'],
      bridge: true,
    },
  ],
};

const item = (
  id: string,
  type: 'app' | 'oss' | 'post' | 'education',
  title: string,
) => ({
  id,
  type,
  title,
  dates: '2020 – 2022',
  path: `/es/proyectos/${id}/`,
});

// `draft` has no visible item, like a draft in production.
const items = [
  item('app', 'app', 'Banking app'),
  item('lib', 'oss', 'KMP <library>'),
  item('post', 'post', 'LLM evals'),
  item('degree', 'education', 'CS degree'),
];

const t = useTranslations('es');
const model = buildMapModel(data, items);

describe('buildMapModel', () => {
  it('joins nodes with items and skips nodes without a visible item', () => {
    expect(model.nodes.map((n) => n.id)).not.toContain('draft');
    const app = model.nodes.find((n) => n.id === 'app');
    expect(app).toMatchObject({
      title: 'Banking app',
      path: '/es/proyectos/app/',
      cluster: 'android',
      desktop: { x: 0.3, y: 0.4 },
    });
  });

  it('drops edges to skipped nodes and clusters without visible nodes', () => {
    expect(model.edges.map((e) => `${e.source}-${e.target}`)).toEqual([
      'app-lib',
      'app-post',
      'degree-lib',
    ]);
    expect(model.clusters.map((c) => c.id)).toEqual([
      'android',
      'ai',
      'fundamentals',
    ]);
  });

  it('orders nodes by cluster, then top to bottom', () => {
    expect(model.nodes.map((n) => n.id)).toEqual([
      'lib',
      'app',
      'post',
      'degree',
    ]);
    const sorted = tabOrder([
      { id: 'b', cluster: 'ai' as const, desktop: { x: 0, y: 0.1 } },
      { id: 'a', cluster: 'android' as const, desktop: { x: 0, y: 0.9 } },
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('is empty when no item is visible', () => {
    const empty = buildMapModel(data, []);
    expect(empty).toEqual({ clusters: [], nodes: [], edges: [] });
  });

  it('counts nodes per type and cluster', () => {
    expect(countBy(model.nodes, 'cluster').get('android')).toBe(2);
    expect(countBy(model.nodes, 'type').get('post')).toBe(1);
  });

  it('labels apps and owned projects on desktop, only the top ones on mobile', () => {
    expect(labeledAtRest({ type: 'app', importance: 3 }, 'desktop')).toBe(true);
    expect(labeledAtRest({ type: 'project', importance: 4 }, 'desktop')).toBe(
      true,
    );
    expect(labeledAtRest({ type: 'post', importance: 3 }, 'desktop')).toBe(
      false,
    );
    expect(labeledAtRest({ type: 'app', importance: 4 }, 'mobile')).toBe(false);
    expect(labeledAtRest({ type: 'app', importance: 5 }, 'mobile')).toBe(true);
  });
});

describe('geometry', () => {
  const android = model.clusters[0]!;

  it('scales the unit square into the desktop canvas with a margin', () => {
    expect(toDesktop({ x: 0, y: 0 })).toEqual({ x: 28, y: 28 });
    expect(toDesktop({ x: 1, y: 1 })).toEqual({
      x: CANVAS.desktop.width - 28,
      y: CANVAS.desktop.height - 28,
    });
  });

  it('places mobile nodes at center + local × radius', () => {
    const { center, rx } = clusterShape(android, 'mobile');
    expect(rx).toBe(72);
    const at = nodePosition(
      { desktop: { x: 0, y: 0 }, local: { x: 0.5, y: -1 } },
      android,
      'mobile',
    );
    expect(at).toEqual({ x: center.x + 36, y: center.y - 72 });
  });

  it('keeps every node of the fixture inside both canvases', () => {
    for (const layout of ['desktop', 'mobile'] as const) {
      for (const node of model.nodes) {
        const cluster = model.clusters.find((c) => c.id === node.cluster)!;
        const at = nodePosition(node, cluster, layout);
        expect(at.x).toBeGreaterThan(0);
        expect(at.y).toBeGreaterThan(0);
        expect(at.x).toBeLessThan(CANVAS[layout].width);
        expect(at.y).toBeLessThan(CANVAS[layout].height);
      }
    }
  });

  it('grows node size with importance, clamped to 1–5', () => {
    expect(nodeRadius(5, 'desktop')).toBeGreaterThan(nodeRadius(1, 'desktop'));
    expect(nodeRadius(9, 'desktop')).toBe(nodeRadius(5, 'desktop'));
    expect(nodeRadius(3, 'mobile')).toBe(nodeRadius(3, 'desktop') + 1);
  });

  it('draws a different shape per type', () => {
    const paths = (['app', 'education', 'oss', 'post'] as const).map((type) =>
      shapePath(type, 6),
    );
    expect(new Set(paths).size).toBe(4);
    expect(shapePath('project', 6)).toBe(shapePath('app', 6));
    expect(shapePath('education', 10)).toBe('M-9,-9H9V9H-9Z');
  });

  it('bends edges to the left of a→b at the midpoint', () => {
    expect(curvePath({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.2)).toBe(
      'M0,0Q50,20 100,0',
    );
    expect(curvePath({ x: 0, y: 0 }, { x: 0, y: 100 }, 0.2)).toBe(
      'M0,0Q-20,50 0,100',
    );
    expect(curvePath({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe('M5,5');
  });

  it('shortens long labels', () => {
    expect(labelText('Short')).toBe('Short');
    const long = labelText('A very long title that does not fit at all');
    expect(long.length).toBeLessThanOrEqual(26);
    expect(long.endsWith('…')).toBe(true);
  });

  it('places labels shown at rest without overlapping, flipping at the edge', () => {
    const canvas = { width: 200, height: 100 };
    const labels = placeLabels(
      [
        { id: 'a', text: 'Alpha', at: { x: 40, y: 50 }, r: 5, atRest: true },
        { id: 'b', text: 'Beta', at: { x: 40, y: 56 }, r: 5, atRest: true },
        { id: 'c', text: 'Gamma', at: { x: 190, y: 50 }, r: 5, atRest: false },
      ],
      canvas,
    );
    expect(labels.get('a')?.anchor).toBe('start');
    // `b` would collide on the right with `a`'s label: it moves elsewhere.
    expect(labels.get('b')).toBeDefined();
    expect(labels.get('b')).not.toEqual(labels.get('a'));
    // `c` sits near the right edge: its label goes to the left.
    expect(labels.get('c')?.anchor).toBe('end');
    expect(labels.get('a')?.atRest).toBe(true);
    expect(labels.get('c')?.atRest).toBe(false);
  });

  it('shows a rest label only on focus when it fits nowhere', () => {
    const labels = placeLabels(
      [
        {
          id: 'wide',
          text: 'A label far wider than the canvas',
          at: { x: 50, y: 20 },
          r: 5,
          atRest: true,
        },
      ],
      { width: 100, height: 40 },
    );
    expect(labels.get('wide')).toMatchObject({
      atRest: false,
    });
  });
});

describe('filters', () => {
  it('shows everything without filters and combines both dimensions', () => {
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(visibleIds(model.nodes, NO_FILTER).size).toBe(4);
    let filter = toggleFilter(NO_FILTER, 'clusters', 'android');
    expect(isFiltering(filter)).toBe(true);
    expect([...visibleIds(model.nodes, filter)]).toEqual(['lib', 'app']);
    filter = toggleFilter(filter, 'types', 'app');
    expect([...visibleIds(model.nodes, filter)]).toEqual(['app']);
    expect(matchesFilter({ type: 'post', cluster: 'android' }, filter)).toBe(
      false,
    );
  });

  it('removes a value when it is toggled again', () => {
    const once = toggleFilter(NO_FILTER, 'types', 'post');
    const twice = toggleFilter(once, 'types', 'post');
    expect(twice.types.size).toBe(0);
    expect(NO_FILTER.types.size).toBe(0);
  });

  it('finds the neighbors of a node', () => {
    expect(neighborsOf(model.edges, 'app')).toEqual(['lib', 'post']);
    expect(neighborsOf(model.edges, 'lib')).toEqual(['app', 'degree']);
    expect(neighborsOf(model.edges, 'nobody')).toEqual([]);
  });

  it('shows only bridges at rest and all edges of the focused node', () => {
    const all = new Set(model.nodes.map((n) => n.id));
    expect([...shownEdges(model.edges, null, all)]).toEqual([
      'app|post',
      'degree|lib',
    ]);
    expect([...shownEdges(model.edges, 'app', all)]).toEqual([
      'app|lib',
      'app|post',
    ]);
    const noPost = new Set(['app', 'lib', 'degree']);
    expect([...shownEdges(model.edges, 'app', noPost)]).toEqual(['app|lib']);
  });
});

describe('renderMap', () => {
  const html = renderMap(model, t).value;

  it('renders every visible node as a link to its page, twice (desktop and mobile)', () => {
    expect(
      html.match(/<a class="m-node[^"]*" href="\/es\/proyectos\/app\/"/g),
    ).toHaveLength(2);
    expect(html).not.toContain('data-node="draft"');
    expect(html).toContain('class="m-svg m-svg-desktop"');
    expect(html).toContain('class="m-svg m-svg-mobile"');
  });

  it('gives each node an accessible name and escapes titles', () => {
    expect(nodeName(model.nodes[0]!, t)).toBe(
      'Librería OSS: KMP <library>, 2020 – 2022. Android',
    );
    expect(html).toContain(
      'aria-label="Librería OSS: KMP &lt;library&gt;, 2020 – 2022. Android"',
    );
    expect(html).not.toContain('<library>');
  });

  it('marks bridges, groups nodes by cluster and skips empty clusters', () => {
    expect(html).toContain('class="m-edge is-bridge" data-edge="app|post"');
    expect(html).toContain('class="m-edge" data-edge="app|lib"');
    expect(html).toContain('<g role="group" aria-label="Android">');
    expect(html).not.toContain('m-cl-cloud');
  });

  it('renders legend filters (disabled until enhanced) with counts', () => {
    expect(html).toContain(
      'data-filter="types" data-value="app" aria-pressed="false" disabled',
    );
    expect(html).toContain('data-filter="clusters" data-value="android"');
    expect(html).toMatch(/Android<\/span> <span class="m-count">2</);
  });

  it('includes a text alternative grouped by topic', () => {
    expect(html).toContain('<details class="m-list">');
    expect(html).toContain('<ul aria-label="IA">');
    expect(html).toContain(
      '<a class="c-link" href="/es/proyectos/post/" data-card-open="post">LLM evals</a>',
    );
  });

  it('suggests ls when nothing is visible', () => {
    const empty = renderMap(buildMapModel(data, []), t).value;
    expect(empty).toContain('data-cmd="ls"');
    expect(empty).not.toContain('<svg');
  });

  it('renders the connections panel', () => {
    const [lib, app, post] = model.nodes;
    expect(renderPanel(null, [], t).value).toContain('m-panel-idle');
    const panel = renderPanel(app!, [lib!, post!], t).value;
    expect(panel).toContain('data-card-open="app">abrir card</a>');
    expect(panel).toContain('data-card-open="post">LLM evals</a>');
    expect(renderPanel(post!, [], t).value).toContain('sin conexiones');
  });
});
