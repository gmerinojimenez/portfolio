/**
 * Test fixture: console data built from a few fake items, so command tests
 * don't depend on `astro:content` or on the real content.
 */
import { toCardItems } from '../card/model';
import type { Localized } from '../../lib/content-core';
import type { ItemData } from '../../lib/content-schema';
import type { Locale } from '../../lib/locales';
import { stagesOf } from '../../lib/stages';
import type { ConsoleData } from './data';
import { profiles } from './profile';

function item(
  id: string,
  data: Partial<ItemData> & Pick<ItemData, 'type' | 'title'>,
  overrides: Partial<Localized<ItemData>> = {},
): Localized<ItemData> {
  return {
    id,
    lang: 'es',
    fallback: false,
    fixture: true,
    body: '',
    data: {
      status: 'published',
      tags: [],
      review: 'pending',
      importance: 3,
      related: [],
      links: [],
      ...data,
    },
    ...overrides,
  };
}

export const sampleItems = (locale: Locale): Localized<ItemData>[] => [
  item(
    'test-bank-app',
    {
      type: 'app',
      title: 'Bank app',
      summary: 'A banking app.',
      tags: ['android', 'kotlin'],
      from: '2019-03',
      to: '2022-06',
      company: 'test-acme',
      importance: 5,
      related: ['test-evals-post'],
      links: [{ label: 'Case study', url: 'https://example.com/case' }],
    },
    { lang: locale },
  ),
  item(
    'test-offline-sync',
    {
      type: 'project',
      title: 'Offline sync',
      summary: 'Sync engine.',
      tags: ['android'],
      from: '2020',
      app: 'test-bank-app',
    },
    { lang: 'es', fallback: locale !== 'es' },
  ),
  item(
    'test-evals-post',
    {
      type: 'post',
      title: 'LLM evals <post>',
      summary: 'Evals.',
      tags: ['ai'],
      from: '2024-05',
    },
    { lang: locale },
  ),
];

function build(locale: Locale): ConsoleData {
  return {
    ...profiles[locale],
    items: toCardItems({
      items: sampleItems(locale),
      companies: [{ id: 'test-acme', name: 'Acme' }],
      locale,
    }),
    stages: stagesOf([{ id: 'test-acme', stage: 'acme' }]),
  };
}

export const sampleData: Record<Locale, ConsoleData> = {
  es: build('es'),
  en: build('en'),
};
