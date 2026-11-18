import { describe, expect, it } from 'vitest';
import {
  localize,
  parseEntryId,
  validateContent,
  visible,
  type RawEntry,
} from './content-core';
import {
  companySchema,
  itemSchema,
  noteSchema,
  type CompanyData,
  type ItemData,
  type NoteData,
} from './content-schema';

const item = (
  id: string,
  data: Record<string, unknown> = {},
): RawEntry<ItemData> => ({
  id,
  data: itemSchema.parse({ type: 'project', title: id, ...data }),
  body: `body of ${id}`,
});

const company = (id: string): RawEntry<CompanyData> => ({
  id: `companies/${id}`,
  data: companySchema.parse({ name: id }),
});

const note = (
  id: string,
  data: Record<string, unknown> = {},
): RawEntry<NoteData> => ({
  id,
  data: noteSchema.parse({ title: id, ...data }),
});

const snapshot = (
  items: RawEntry<ItemData>[],
  companies: RawEntry<CompanyData>[] = [],
  notes: RawEntry<NoteData>[] = [],
) => ({ items, companies, notes });

describe('item schema', () => {
  it('accepts an item with only type and title (draft by default)', () => {
    const parsed = itemSchema.parse({ type: 'app', title: 'x' });
    expect(parsed.status).toBe('draft');
    expect(parsed.importance).toBe(3);
    expect(parsed.related).toEqual([]);
  });

  it('requires summary, tags and from when published', () => {
    const result = itemSchema.safeParse({
      type: 'app',
      title: 'x',
      status: 'published',
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.')).sort();
    expect(paths).toEqual(['from', 'summary', 'tags']);
  });

  it('accepts a complete published item', () => {
    const result = itemSchema.safeParse({
      type: 'oss',
      title: 'x',
      status: 'published',
      from: '2021-03',
      summary: 'One line.',
      tags: ['kotlin'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown types, multi-line summaries and bad dates', () => {
    expect(itemSchema.safeParse({ type: 'blog', title: 'x' }).success).toBe(
      false,
    );
    expect(
      itemSchema.safeParse({ type: 'app', title: 'x', summary: 'a\nb' })
        .success,
    ).toBe(false);
    expect(
      itemSchema.safeParse({ type: 'app', title: 'x', from: '03/2021' })
        .success,
    ).toBe(false);
  });

  it('accepts dates as YAML would parse them (number, Date) and "present"', () => {
    const parsed = itemSchema.parse({
      type: 'app',
      title: 'x',
      from: 2019,
      to: new Date('2021-03-15T00:00:00Z'),
    });
    expect(parsed.from).toBe('2019');
    expect(parsed.to).toBe('2021-03-15');
    expect(
      itemSchema.parse({ type: 'app', title: 'x', to: 'present' }).to,
    ).toBe('present');
  });

  it('requires summary and tags for published notes but not from', () => {
    expect(
      noteSchema.safeParse({ title: 'n', status: 'published' }).success,
    ).toBe(false);
    expect(
      noteSchema.safeParse({
        title: 'n',
        status: 'published',
        summary: 's',
        tags: ['t'],
      }).success,
    ).toBe(true);
  });
});

describe('parseEntryId', () => {
  it('reads id, language and fixture flag from the path', () => {
    expect(parseEntryId('items/es/my-app')).toEqual({
      id: 'my-app',
      lang: 'es',
      fixture: false,
    });
    expect(parseEntryId('fixtures/items/en/demo-x')).toEqual({
      id: 'demo-x',
      lang: 'en',
      fixture: true,
    });
  });

  it('throws on a path without a language folder', () => {
    expect(() => parseEntryId('items/my-app')).toThrow();
  });
});

describe('localize', () => {
  const es = item('items/es/a', {
    title: 'Título',
    summary: 'Resumen',
    tags: ['uno'],
  });
  const enReviewed = item('items/en/a', {
    title: 'Title',
    summary: 'Summary',
    tags: ['one'],
    review: 'reviewed',
  });
  const enPending = item('items/en/a', { title: 'Title', review: 'pending' });

  it('returns Spanish for es', () => {
    const [result] = localize([es, enReviewed], 'es');
    expect(result).toMatchObject({ id: 'a', lang: 'es', fallback: false });
    expect(result?.data.title).toBe('Título');
  });

  it('returns the reviewed English text for en, keeping the Spanish structure', () => {
    const published = item('items/es/a', {
      status: 'published',
      from: '2020',
      summary: 'Resumen',
      tags: ['uno'],
      importance: 5,
    });
    const [result] = localize([published, enReviewed], 'en');
    expect(result).toMatchObject({ lang: 'en', fallback: false });
    expect(result?.data.title).toBe('Title');
    expect(result?.data.status).toBe('published');
    expect(result?.data.importance).toBe(5);
    expect(result?.body).toBe('body of items/en/a');
  });

  it('falls back to Spanish with a flag when English is pending or missing', () => {
    expect(localize([es, enPending], 'en')[0]).toMatchObject({
      lang: 'es',
      fallback: true,
    });
    expect(localize([es], 'en')[0]).toMatchObject({
      lang: 'es',
      fallback: true,
    });
  });

  it('ignores an English file without Spanish source', () => {
    expect(localize([enReviewed], 'en')).toEqual([]);
  });

  it('marks fixtures', () => {
    const fx = item('fixtures/items/es/demo-a');
    expect(localize([fx], 'es')[0]?.fixture).toBe(true);
  });
});

describe('visible', () => {
  it('drops drafts unless includeDrafts is set', () => {
    const list = localize(
      [
        item('items/es/a', {
          status: 'published',
          summary: 's',
          tags: ['t'],
          from: '2020',
        }),
        item('items/es/b'),
      ],
      'es',
    );
    expect(visible(list, false).map((i) => i.id)).toEqual(['a']);
    expect(visible(list, true).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('validateContent', () => {
  it('passes with valid references', () => {
    const errors = validateContent(
      snapshot(
        [
          item('items/es/a', { company: 'acme', related: ['b'] }),
          item('items/es/b', { app: 'a' }),
          item('items/en/a'),
        ],
        [company('acme')],
        [note('notes/es/n', { related: ['a'] })],
      ),
    );
    expect(errors).toEqual([]);
  });

  it('reports a related id that does not exist', () => {
    const errors = validateContent(
      snapshot([item('items/es/a', { related: ['ghost'] })]),
    );
    expect(errors).toEqual([
      'items: "a" has related id "ghost" that does not exist',
    ]);
  });

  it('reports an unknown company and an unknown app', () => {
    const errors = validateContent(
      snapshot([item('items/es/a', { company: 'nope', app: 'nada' })]),
    );
    expect(errors).toHaveLength(2);
    expect(errors.join('\n')).toContain('unknown company "nope"');
    expect(errors.join('\n')).toContain('unknown app "nada"');
  });

  it('reports self references', () => {
    const errors = validateContent(
      snapshot([item('items/es/a', { related: ['a'] })]),
    );
    expect(errors.join('\n')).toContain('lists itself in related');
  });

  it('reports an English file with no Spanish source', () => {
    const errors = validateContent(snapshot([item('items/en/a')]));
    expect(errors.join('\n')).toContain('no Spanish source');
  });

  it('reports an id used by both real content and a fixture', () => {
    const errors = validateContent(
      snapshot([item('items/es/a'), item('fixtures/items/es/a')]),
    );
    expect(errors.join('\n')).toContain('duplicate id "a"');
  });

  it('reports a note pointing to a missing item', () => {
    const errors = validateContent(
      snapshot([], [], [note('notes/es/n', { related: ['ghost'] })]),
    );
    expect(errors.join('\n')).toContain('notes: "n" has related id "ghost"');
  });

  it('checks drafts too', () => {
    const errors = validateContent(
      snapshot([item('items/es/a', { status: 'draft', related: ['ghost'] })]),
    );
    expect(errors).toHaveLength(1);
  });
});
