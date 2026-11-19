import { describe, expect, it } from 'vitest';
import { useTranslations } from '../../i18n/ui';
import { inferCluster } from '../../lib/topics';
import type { StageRef } from '../../lib/stages';
import {
  connectionsOf,
  isFiltering,
  matchesFilter,
  NO_FILTER,
  pathSet,
  shownEdges,
  toggleFilter,
  visibleIds,
} from './filters';
import { CANVAS, labelText, nodeRadius, placeLabels } from './geometry';
import { layoutTree } from './layout';
import {
  buildTreeModel,
  contentNow,
  countBy,
  labeledAtRest,
  monogram,
  parseDate,
  type MapItem,
} from './model';
import { nodeName, renderMap, renderPanel, sectionName } from './render';

const t = useTranslations('es');

const ref = (id: string) => ({
  id,
  title: id,
  type: 'project' as const,
  path: `/es/proyectos/${id}/`,
});

function item(
  id: string,
  fields: Partial<MapItem> & Pick<MapItem, 'type'>,
): MapItem {
  return {
    id,
    title: id,
    dates: fields.from?.slice(0, 4) ?? '',
    path: `/es/proyectos/${id}/`,
    tags: [],
    importance: 3,
    context: fields.companyId ?? 'Personal',
    personal: false,
    cert: false,
    related: [],
    ...fields,
  };
}

const items: MapItem[] = [
  item('tuenti-app', {
    type: 'app',
    from: '2015-04',
    to: '2023-10',
    companyId: 'tuenti',
    importance: 5,
    tags: ['android'],
  }),
  item('mod', {
    type: 'project',
    from: '2015-04',
    companyId: 'tuenti',
    parent: { ...ref('tuenti-app'), type: 'app' },
    importance: 4,
    tags: ['kotlin'],
  }),
  item('voip', {
    type: 'project',
    from: '2015-04',
    companyId: 'tuenti',
    tags: ['android'],
  }),
  item('lib', {
    type: 'oss',
    title: 'KMP <library>',
    from: '2015-04',
    companyId: 'tuenti',
    importance: 4,
    tags: ['android'],
    related: [ref('voip')],
  }),
  item('acme-sdk', {
    type: 'project',
    from: '2012-08',
    to: '2015-04',
    companyId: 'acme',
    tags: ['android'],
  }),
  item('beta-data', {
    type: 'project',
    from: '2011',
    to: '2011',
    companyId: 'beta',
    tags: ['backend'],
  }),
  item('post', {
    type: 'post',
    from: '2021',
    tags: ['android'],
    related: [ref('mod')],
  }),
  item('side', {
    type: 'app',
    from: '2026-03',
    personal: true,
    tags: ['llm'],
  }),
  item('degree', {
    type: 'education',
    from: '2004',
    to: '2011',
    companyId: 'ucm',
    importance: 2,
  }),
  item('c1', {
    type: 'education',
    from: '2015-02',
    companyId: 'coursera',
    cert: true,
    importance: 1,
  }),
  item('c2', {
    type: 'education',
    from: '2016-01',
    companyId: 'coursera',
    cert: true,
    importance: 1,
  }),
  item('c3', {
    type: 'education',
    from: '2026-10',
    companyId: 'anthropic',
    cert: true,
    importance: 1,
    tags: ['ai'],
  }),
];

const stages: StageRef[] = [
  { id: 'early', companies: ['acme', 'beta'] },
  { id: 'tuenti', companies: ['tuenti'] },
];

const model = buildTreeModel(items, stages, t);
const node = (id: string) => model.tree.get(id)!;

describe('dates', () => {
  it('parses partial dates as decimal years', () => {
    expect(parseDate('2021')).toBe(2021);
    expect(parseDate('2021-04')).toBe(2021.25);
    expect(parseDate('2021', true)).toBe(2022);
    expect(parseDate('2021-12', true)).toBe(2022);
    expect(parseDate(undefined)).toBeNull();
  });

  it('takes "now" from the content, not the clock', () => {
    expect(contentNow(items)).toBeCloseTo(2026.833, 3);
    expect(node('tuenti-app').t1).toBeCloseTo(2023.833, 3);
  });
});

describe('inferCluster', () => {
  const byId = new Map<
    string,
    { id: string; tags: string[]; topic?: string; app?: string }
  >();
  it('uses the topic, then tags, then the app, then the default', () => {
    expect(inferCluster({ id: 'a', topic: 'cloud', tags: [] }, byId)).toBe(
      'cloud',
    );
    expect(inferCluster({ id: 'a', topic: 'kotlin', tags: [] }, byId)).toBe(
      'android',
    );
    expect(inferCluster({ id: 'a', tags: ['llm', 'rag'] }, byId)).toBe('ai');
    const app = { id: 'app', tags: ['aws'] };
    expect(
      inferCluster({ id: 'p', tags: [], app: 'app' }, new Map([['app', app]])),
    ).toBe('cloud');
    expect(inferCluster({ id: 'a', topic: 'personal', tags: [] }, byId)).toBe(
      'fundamentals',
    );
  });
});

describe('buildTreeModel', () => {
  it('orders sections: stem, stages newest first, roots', () => {
    expect(model.sections.map((s) => s.id)).toEqual([
      'stem',
      's:tuenti',
      's:early',
      'roots',
    ]);
    const [stem, tuenti, early] = model.sections;
    expect(stem!.title).toBe('Por mi cuenta');
    expect(tuenti).toMatchObject({
      title: 'Tuenti',
      ordinal: 2,
      period: '2015 – 2023',
    });
    expect(early).toMatchObject({
      title: 'Primeros pasos',
      ordinal: 1,
      period: '2011 – 2015',
    });
  });

  it('hangs items from their app, their stage or their company', () => {
    expect(node('mod').parent).toBe('tuenti-app');
    expect(node('tuenti-app').parent).toBe('s:tuenti');
    expect(node('voip').parent).toBe('s:tuenti');
    // A stage with several companies groups its items by company.
    expect(node('acme-sdk').parent).toBe('g:acme');
    expect(node('beta-data').parent).toBe('g:beta');
    expect(node('g:acme')).toMatchObject({ kind: 'group', parent: 's:early' });
  });

  it('follows related for posts and grows personal items on the stem', () => {
    expect(node('post')).toMatchObject({ parent: 'mod', section: 's:tuenti' });
    expect(node('side')).toMatchObject({ parent: 'p:stem', section: 'stem' });
    expect(node('p:stem').kind).toBe('stem');
    expect(node('p:stem').t).toBeCloseTo(2026.167, 3);
  });

  it('puts education in the roots, grouping certificates by issuer', () => {
    expect(node('degree')).toMatchObject({ parent: null, section: 'roots' });
    expect(node('c1').parent).toBe('g:coursera');
    expect(node('c2').parent).toBe('g:coursera');
    expect(node('c3').parent).toBeNull(); // a single certificate: no group
  });

  it('spreads shared placeholder dates, keeping the most important', () => {
    expect(node('tuenti-app').t).toBe(2015.25);
    expect(node('lib').t).toBeGreaterThan(2015.25);
    expect(node('voip').t).toBeGreaterThan(node('lib').t);
    expect(node('voip').t).toBeLessThan(2023.84);
  });

  it('lists items newest first and keeps only non-tree related edges', () => {
    expect(model.nodes.map((n) => n.id).slice(0, 2)).toEqual(['side', 'post']);
    expect(model.edges).toEqual([{ source: 'lib', target: 'voip' }]);
    expect(countBy(model.nodes, 'type').get('education')).toBe(4);
  });

  it('has no stem without personal items, and no roots without education', () => {
    const work = buildTreeModel(
      items.filter((i) => !i.personal && i.type !== 'education'),
      stages,
      t,
    );
    expect(work.tree.has('p:stem')).toBe(false);
    expect(work.sections.map((s) => s.kind)).toEqual(['stage', 'stage']);
  });

  it('breaks app cycles at the stage', () => {
    const loop = buildTreeModel(
      [
        item('a', {
          type: 'app',
          from: '2020',
          companyId: 'tuenti',
          parent: { ...ref('b'), type: 'app' },
        }),
        item('b', {
          type: 'app',
          from: '2021',
          companyId: 'tuenti',
          parent: { ...ref('a'), type: 'app' },
        }),
      ],
      stages,
      t,
    );
    expect(loop.tree.get('a')!.parent).toBe('s:tuenti');
  });
});

describe('layoutTree', () => {
  for (const layout of ['desktop', 'mobile'] as const) {
    const L = layoutTree(model, layout);
    const { width, height } = CANVAS[layout];

    it(`${layout}: is deterministic and stays inside the canvas`, () => {
      expect(JSON.stringify([...layoutTree(model, layout).nodes])).toBe(
        JSON.stringify([...L.nodes]),
      );
      for (const p of L.nodes.values()) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(height);
      }
    });

    it(`${layout}: grows upwards in time, with education below the ground`, () => {
      const at = (id: string) => L.nodes.get(id)!;
      expect(at('s:tuenti').y).toBeLessThan(at('s:early').y);
      expect(at('s:tuenti').delay).toBeGreaterThan(at('s:early').delay);
      expect(at('degree').y).toBeGreaterThan(L.groundY);
      expect(at('c3').y).toBeGreaterThan(L.groundY);
      expect(at('side').x).toBeGreaterThan(at('s:tuenti').x);
      // A child never appears before its parent.
      expect(at('mod').delay).toBeGreaterThan(at('tuenti-app').delay);
    });

    it(`${layout}: keeps nodes from overlapping`, () => {
      const placed = [...L.nodes.values()];
      let worst = Number.POSITIVE_INFINITY;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]!;
          const b = placed[j]!;
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
        }
      }
      expect(worst).toBeGreaterThan(-1);
    });

    it(`${layout}: draws a stroke into every node but the anchors`, () => {
      const ids = new Set(L.strokes.map((s) => s.id));
      for (const n of model.tree.values()) {
        if (n.kind !== 'stage') expect(ids.has(n.id)).toBe(true);
      }
      expect(L.strokes.every((s) => s.length > 0 && s.duration > 0)).toBe(true);
      expect(L.trunk?.stops[0]).toEqual({
        offset: 0,
        cluster: node('s:early').cluster,
      });
    });
  }
});

describe('filters', () => {
  it('toggles filters and matches both dimensions', () => {
    const byType = toggleFilter(NO_FILTER, 'types', 'oss');
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering(byType)).toBe(true);
    expect(toggleFilter(byType, 'types', 'oss').types.size).toBe(0);
    expect(matchesFilter({ type: 'oss', cluster: 'android' }, byType)).toBe(
      true,
    );
    expect(matchesFilter({ type: 'app', cluster: 'android' }, byType)).toBe(
      false,
    );
    expect([...visibleIds(model.nodes, byType)]).toEqual(['lib']);
  });

  it('lights the focused node, its path to the trunk and its children', () => {
    expect([...pathSet(model, 'mod')].sort()).toEqual(
      ['mod', 'post', 's:tuenti', 'tuenti-app'].sort(),
    );
    expect(connectionsOf(model, 'mod').sort()).toEqual(['post', 'tuenti-app']);
    expect(connectionsOf(model, 'lib')).toEqual(['voip']);
  });

  it('shows related connections only on focus', () => {
    const all = visibleIds(model.nodes, NO_FILTER);
    expect(shownEdges(model.edges, null, all).size).toBe(0);
    expect([...shownEdges(model.edges, 'voip', all)]).toEqual(['lib|voip']);
    const noLib = new Set([...all].filter((id) => id !== 'lib'));
    expect(shownEdges(model.edges, 'voip', noLib).size).toBe(0);
  });
});

describe('geometry', () => {
  it('sizes nodes by importance, a bit bigger on mobile', () => {
    expect(nodeRadius(5, 'desktop')).toBeGreaterThan(nodeRadius(1, 'desktop'));
    expect(nodeRadius(3, 'mobile')).toBe(nodeRadius(3, 'desktop') + 1);
  });

  it('shortens long labels', () => {
    expect(labelText('Short')).toBe('Short');
    expect(labelText('A'.repeat(40))).toHaveLength(26);
  });

  it('derives badge letters from the last meaningful word', () => {
    expect(monogram('App Android de Tuenti')).toBe('Tu');
    expect(monogram('Merlyn for panels')).toBe('Pa');
  });

  it('places labels on their branch side first and avoids obstacles', () => {
    const canvas = { width: 400, height: 200 };
    const at = { x: 200, y: 100 };
    const left = placeLabels(
      [{ id: 'a', text: 'Label', at, r: 6, atRest: true, side: -1 }],
      canvas,
    );
    expect(left.get('a')?.anchor).toBe('end');
    const blocked = placeLabels(
      [{ id: 'a', text: 'Label', at, r: 6, atRest: true, side: -1 }],
      canvas,
      [{ x1: 100, x2: 199, y1: 80, y2: 120 }],
    );
    expect(blocked.get('a')?.anchor).toBe('start');
  });

  it('labels apps and key projects at rest on desktop, fewer on mobile', () => {
    expect(labeledAtRest({ type: 'app', importance: 3 }, 'desktop')).toBe(true);
    expect(labeledAtRest({ type: 'project', importance: 3 }, 'desktop')).toBe(
      false,
    );
    expect(labeledAtRest({ type: 'app', importance: 4 }, 'mobile')).toBe(false);
    expect(labeledAtRest({ type: 'app', importance: 5 }, 'mobile')).toBe(true);
  });
});

describe('renderMap', () => {
  const html = renderMap(model, t).value;

  it('renders every item as a link in both SVGs', () => {
    for (const { id } of items) {
      expect(html.match(new RegExp(`data-node="${id}"`, 'g'))).toHaveLength(2);
    }
    expect(html).toContain('class="m-svg m-svg-desktop"');
    expect(html).toContain('class="m-svg m-svg-mobile"');
  });

  it('gives nodes and sections accessible names and escapes titles', () => {
    const lib = model.nodes.find((n) => n.id === 'lib')!;
    expect(nodeName(lib, t)).toBe('Librería OSS: KMP <library>, 2015. Android');
    expect(html).toContain(
      'aria-label="Librería OSS: KMP &lt;library&gt;, 2015. Android"',
    );
    expect(html).not.toContain('<library>');
    expect(sectionName(model.sections[1]!, t)).toBe(
      'Etapa 2: Tuenti, 2015 – 2023',
    );
    expect(html).toContain(
      '<g role="group" aria-label="Etapa 2: Tuenti, 2015 – 2023">',
    );
  });

  it('carries growth timings and hides the scenery from assistive tech', () => {
    expect(html).toMatch(/class="m-body" style="--d:[\d.]+s"/);
    expect(html).toMatch(
      /data-branch="mod" d="M[^"]+" style="--d:[\d.]+s;--dur:[\d.]+s;--len:\d+"/,
    );
    expect(html).toContain('<g class="m-scenery" aria-hidden="true">');
    expect(html).toContain('data-anchor="s:tuenti"');
    expect(html).toContain('>raíces</text>');
    expect(html).toContain('4 títulos y certificados');
    expect(node('tuenti-app').badge).toBe('Tu');
    expect(node('g:acme').badge).toBe('Ac');
    expect(node('mod').badge).toBeUndefined();
    expect(html).toContain('filter="url(#m-glow-desktop)"');
  });

  it('renders the legend and replay disabled until enhanced', () => {
    expect(html).toContain(
      'data-filter="types" data-value="app" aria-pressed="false" disabled',
    );
    expect(html).toMatch(/data-map-replay aria-label="[^"]+" disabled/);
    expect(html).toMatch(/Android<\/span> <span class="m-count">\d+</);
  });

  it('includes a text alternative grouped by stage', () => {
    expect(html).toContain('<details class="m-list">');
    expect(html).toContain(
      '<ul aria-label="Etapa 1: Primeros pasos, 2011 – 2015">',
    );
    expect(html).toContain('<ul aria-label="Formación">');
    expect(html).toContain('data-card-open="post">post</a>');
  });

  it('suggests ls when nothing is visible', () => {
    const empty = renderMap(buildTreeModel([], stages, t), t).value;
    expect(empty).toContain('data-cmd="ls"');
    expect(empty).not.toContain('<svg');
  });

  it('renders the connections panel', () => {
    const [side, post] = model.nodes;
    expect(renderPanel(null, [], t).value).toContain('m-panel-idle');
    const panel = renderPanel(post!, [side!], t).value;
    expect(panel).toContain('data-card-open="post">abrir card</a>');
    expect(renderPanel(side!, [], t).value).toContain('sin conexiones');
  });
});
