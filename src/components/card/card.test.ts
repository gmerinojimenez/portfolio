import { describe, expect, it } from 'vitest';
import { sampleData, sampleItems } from '../console/sample-data';
import { renderCard } from './card-view';
import {
  closeAction,
  landedState,
  pushedState,
  readCardState,
} from './history-state';
import {
  cardContext,
  compareItems,
  filterByTag,
  formatDates,
  groupByTopic,
  tagsOf,
  toCardItems,
} from './model';

const card = (locale: 'es' | 'en', id: string) => {
  const found = sampleData[locale].items.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe('card model', () => {
  it('formats dates as years', () => {
    expect(formatDates('2019-03', '2022-06', 'es')).toBe('2019 – 2022');
    expect(formatDates('2019', '2019-12', 'es')).toBe('2019');
    expect(formatDates('2019', 'present', 'es')).toBe('2019 – hoy');
    expect(formatDates('2019', 'present', 'en')).toBe('2019 – present');
    expect(formatDates('2020', undefined, 'en')).toBe('2020');
    expect(formatDates(undefined, undefined, 'en')).toBe('');
  });

  it('derives the context from the company or the type', () => {
    expect(cardContext({ type: 'app', links: [] }, 'Acme', 'es')).toBe('Acme');
    expect(cardContext({ type: 'oss', links: [] }, undefined, 'es')).toBe(
      'Open source',
    );
    expect(
      cardContext(
        {
          type: 'post',
          links: [{ label: 'x', url: 'https://x', kind: 'medium' }],
        },
        undefined,
        'en',
      ),
    ).toBe('Medium');
    expect(cardContext({ type: 'project', links: [] }, undefined, 'en')).toBe(
      'Personal',
    );
  });

  it('resolves parent, related (both directions) and paths', () => {
    const app = card('es', 'test-bank-app');
    expect(app.context).toBe('Acme');
    expect(app.path).toBe('/es/proyectos/test-bank-app/');
    // explicit related, then the project that belongs to this app
    expect(app.related.map((r) => r.id)).toEqual([
      'test-evals-post',
      'test-offline-sync',
    ]);
    const project = card('en', 'test-offline-sync');
    expect(project.parent?.path).toBe('/en/projects/test-bank-app/');
    expect(project.related.map((r) => r.id)).toEqual([]);
    // the post is related back to the app that lists it
    expect(card('es', 'test-evals-post').related.map((r) => r.id)).toEqual([
      'test-bank-app',
    ]);
  });

  it('never links to items that are not visible', () => {
    const items = sampleItems('es').filter((i) => i.id !== 'test-evals-post');
    const cards = toCardItems({ items, companies: [], locale: 'es' });
    const app = cards.find((c) => c.id === 'test-bank-app');
    expect(app?.related.map((r) => r.id)).toEqual(['test-offline-sync']);
    expect(app?.context).toBe('Personal');
  });

  it('sorts by importance, then date, then title', () => {
    const sorted = [
      { importance: 3, from: '2020', title: 'b' },
      { importance: 3, from: '2021', title: 'z' },
      { importance: 5, from: '2010', title: 'a' },
      { importance: 3, from: '2020', title: 'a' },
    ].sort(compareItems);
    expect(sorted.map((i) => i.title)).toEqual(['a', 'z', 'a', 'b']);
  });

  it('lists tags by frequency and filters by tag', () => {
    const items = sampleData.es.items;
    expect(tagsOf(items)).toEqual(['android', 'ai', 'kotlin']);
    expect(filterByTag(items, 'Kotlin').map((i) => i.id)).toEqual([
      'test-bank-app',
    ]);
  });
});

describe('card view', () => {
  it('renders the card content with escaped text', () => {
    const html = renderCard(card('es', 'test-bank-app'), {
      locale: 'es',
      heading: 'h2',
    }).value;
    expect(html).toContain('<h2 class="k-title" id="card-title"');
    expect(html).toContain('App</span>');
    expect(html).toContain('Acme · 2019 – 2022');
    expect(html).toContain('href="https://example.com/case"');
    expect(html).toContain('data-card-open="test-offline-sync"');
    expect(html).toContain('href="/es/proyectos/test-offline-sync/"');
    expect(html).not.toContain('k-notice');

    const post = renderCard(card('es', 'test-evals-post'), {
      locale: 'es',
      heading: 'h1',
    }).value;
    expect(post).toContain('<h1');
    expect(post).toContain('LLM evals &lt;post&gt;');
  });

  it('shows the parent app and the Spanish fallback notice in English', () => {
    const html = renderCard(card('en', 'test-offline-sync'), {
      locale: 'en',
      heading: 'h2',
    }).value;
    expect(html).toContain('Part of:');
    expect(html).toContain('k-notice');
    expect(html).toContain('lang="es"');
  });

  it('keeps the trusted body HTML as is', () => {
    const html = renderCard(
      {
        ...card('es', 'test-bank-app'),
        bodyHtml: '<p>Hello <em>world</em></p>',
      },
      { locale: 'es', heading: 'h2' },
    ).value;
    expect(html).toContain('<div class="k-body"><p>Hello <em>world</em></p>');
  });
});

describe('card history', () => {
  it('reads only valid states', () => {
    expect(readCardState(null)).toBeUndefined();
    expect(readCardState({ foo: 1 })).toBeUndefined();
    expect(readCardState({ card: 'a', depth: 2 })).toEqual({
      card: 'a',
      depth: 2,
      landed: false,
    });
  });

  it('stacks cards opened from other cards', () => {
    const first = pushedState(undefined, false, 'a');
    expect(first).toEqual({ card: 'a', depth: 1, landed: false });
    const second = pushedState(first, true, 'b');
    expect(second).toEqual({ card: 'b', depth: 2, landed: false });
    expect(pushedState(landedState('a'), true, 'b')).toEqual({
      card: 'b',
      depth: 1,
      landed: true,
    });
  });

  it('closes by going back to the console, or rewriting the URL', () => {
    expect(closeAction({ card: 'b', depth: 2, landed: false }, '/es/')).toEqual(
      { kind: 'back', steps: 2 },
    );
    expect(closeAction(landedState('a'), '/es/')).toEqual({
      kind: 'replace',
      url: '/es/',
    });
    expect(closeAction(undefined, '/en/')).toEqual({
      kind: 'replace',
      url: '/en/',
    });
  });
});

describe('groupByTopic', () => {
  it('puts known clusters first, then other topics, then items without one', () => {
    const groups = groupByTopic([
      { id: 1, topic: 'kotlin' },
      { id: 2, topic: 'AI' },
      { id: 3, topic: undefined },
      { id: 4, topic: 'android' },
      { id: 5, topic: 'ai' },
    ]);
    expect(groups.map((g) => g.topic)).toEqual([
      'android',
      'ai',
      'kotlin',
      'other',
    ]);
    expect(groups[1]?.items.map((i) => i.id)).toEqual([2, 5]);
  });
});
