import { describe, expect, it } from 'vitest';
import { validateContent } from './content-core';
import {
  findTech,
  itemStackGroups,
  parseTechCatalog,
  inheritAppEnds,
  summarizeStacks,
  techIds,
  toStackUses,
  validateCatalog,
  type TechCatalog,
} from './tech';
import { techCatalog } from './tech-catalog';

const catalog: TechCatalog = [
  {
    id: 'android',
    label: { es: 'Android', en: 'Android' },
    techs: [
      { id: 'room', name: 'Room', aliases: ['Jetpack Room'] },
      { id: 'compose', name: 'Jetpack Compose', aliases: ['Compose'] },
      { id: 'hilt', name: 'Hilt', aliases: [] },
    ],
  },
  {
    id: 'languages',
    label: { es: 'Lenguajes', en: 'Languages' },
    techs: [{ id: 'kotlin', name: 'Kotlin', aliases: [] }],
  },
  {
    id: 'other',
    label: { es: 'Otros', en: 'Other' },
    techs: [{ id: 'godot', name: 'Godot', aliases: [] }],
  },
];

const items = [
  {
    id: 'old-app',
    stack: toStackUses(['kotlin', { id: 'room', from: '2017' }]),
    from: '2015-04',
    to: '2023-10',
  },
  {
    id: 'new-app',
    stack: toStackUses(['kotlin', 'compose']),
    from: '2023',
    to: 'present',
  },
  { id: 'lib', stack: toStackUses(['compose']), from: '2022' },
  { id: 'course', from: '2014' },
];

describe('tech catalog (S15)', () => {
  it('the real catalog has the five stacks in order, with no repeats', () => {
    expect(techCatalog.map((s) => s.id)).toEqual([
      'android',
      'backend',
      'ai',
      'languages',
      'other',
    ]);
    expect(validateCatalog(techCatalog)).toEqual([]);
    for (const stack of techCatalog) {
      expect(stack.label.es).not.toBe('');
      expect(stack.label.en).not.toBe('');
    }
  });

  it('reports a technology in two stacks and a shared alias', () => {
    const broken: TechCatalog = [
      ...catalog,
      {
        id: 'more',
        label: { es: 'Más', en: 'More' },
        techs: [
          { id: 'room', name: 'Room DB', aliases: [] },
          { id: 'jc', name: 'JC', aliases: ['compose'] },
        ],
      },
    ];
    const errors = validateCatalog(broken);
    expect(errors.some((e) => e.includes('"room" is in stacks'))).toBe(true);
    expect(errors.some((e) => e.includes('"compose"'))).toBe(true);
    expect(() =>
      parseTechCatalog(
        '- id: a\n  label: {es: A, en: A}\n  techs: [{id: x, name: X}, {id: x, name: Y}]',
      ),
    ).toThrow(/Invalid tech catalog/);
  });

  it('summarizes each stack with items, years and order', () => {
    const stacks = summarizeStacks(catalog, items, 'en');
    // Stacks without any used technology are dropped (`other`).
    expect(stacks.map((s) => s.id)).toEqual(['android', 'languages']);
    const android = stacks[0]!;
    // Most items first, then the most recent; unused techs (hilt) are left out.
    expect(android.techs.map((t) => t.id)).toEqual(['compose', 'room']);
    expect(android.techs[0]).toMatchObject({
      items: ['new-app', 'lib'],
      from: '2022',
      to: 'present',
    });
    expect(android.techs[1]).toMatchObject({
      items: ['old-app'],
      // Room started later than the app: its own `from` wins.
      from: '2017',
      to: '2023',
    });
    expect(stacks[1]!.techs[0]).toMatchObject({
      id: 'kotlin',
      items: ['new-app', 'old-app'],
      from: '2015',
      to: 'present',
    });
    expect(summarizeStacks(catalog, items, 'es')[1]!.label).toBe('Lenguajes');
  });

  it('projects without an end last as long as their app', () => {
    const [app, project, other] = inheritAppEnds([
      { id: 'app', from: '2023', to: 'present' },
      { id: 'part', from: '2023', app: 'app' },
      { id: 'own', from: '2020', to: '2021', app: 'app' },
    ]);
    expect(app?.to).toBe('present');
    expect(project?.to).toBe('present');
    expect(other?.to).toBe('2021');
  });

  it("groups an item's stack in catalog order", () => {
    expect(
      itemStackGroups(catalog, ['kotlin', 'room', 'compose'], 'es'),
    ).toEqual([
      {
        id: 'android',
        label: 'Android',
        techs: [
          { id: 'room', name: 'Room' },
          { id: 'compose', name: 'Jetpack Compose' },
        ],
        skills: [],
      },
      {
        id: 'languages',
        label: 'Lenguajes',
        techs: [{ id: 'kotlin', name: 'Kotlin' }],
        skills: [],
      },
    ]);
    expect(itemStackGroups(catalog, undefined, 'es')).toEqual([]);
  });

  describe('skills', () => {
    const withSkills: TechCatalog = [
      {
        id: 'android',
        label: { es: 'Android', en: 'Android' },
        techs: [{ id: 'room', name: 'Room', aliases: [] }],
        skills: [
          {
            id: 'android-performance',
            name: { es: 'Rendimiento y memoria', en: 'Performance & memory' },
            aliases: ['Memory leaks'],
          },
          {
            id: 'android-lifecycle',
            name: { es: 'Ciclo de vida', en: 'Android lifecycle' },
            aliases: [],
          },
        ],
      },
    ];
    const used = [
      {
        id: 'app',
        from: '2015',
        to: '2023',
        stack: toStackUses(['room', 'android-performance']),
      },
    ];

    it('lists the skills an item shows apart from its technologies', () => {
      expect(
        itemStackGroups(withSkills, ['android-performance', 'room'], 'en'),
      ).toEqual([
        {
          id: 'android',
          label: 'Android',
          techs: [{ id: 'room', name: 'Room' }],
          skills: [{ id: 'android-performance', name: 'Performance & memory' }],
        },
      ]);
    });

    it("summarizes skills in the reader's language and drops unused ones", () => {
      const [android] = summarizeStacks(withSkills, used, 'es');
      expect(android?.techs.map((t) => t.id)).toEqual(['room']);
      expect(android?.skills).toEqual([
        {
          id: 'android-performance',
          name: 'Rendimiento y memoria',
          aliases: ['Performance & memory', 'Memory leaks'],
          items: ['app'],
          from: '2015',
          to: '2023',
        },
      ]);
    });

    it('finds a skill by its name in either language or an alias', () => {
      const stacks = summarizeStacks(withSkills, used, 'es');
      expect(findTech(stacks, 'performance & memory')?.id).toBe(
        'android-performance',
      );
      expect(findTech(stacks, 'memory leaks')?.id).toBe('android-performance');
      expect(findTech(stacks, 'ciclo de vida')).toBeUndefined(); // unused
    });

    it('rejects a skill that reuses a technology id or name', () => {
      const [android] = withSkills;
      if (!android) throw new Error('fixture');
      expect(
        validateCatalog([
          {
            ...android,
            skills: [
              { id: 'room', name: { es: 'Room', en: 'Room' }, aliases: [] },
            ],
          },
        ]),
      ).toContain('tech: "room" is in stacks "android" and "android"');
    });

    it('content validation accepts skill ids in `stack`', () => {
      expect(techIds(withSkills)).toEqual(
        new Set(['room', 'android-performance', 'android-lifecycle']),
      );
    });
  });

  it('finds a technology by id, name or alias, ignoring case and accents', () => {
    const stacks = summarizeStacks(catalog, items, 'es');
    expect(findTech(stacks, 'room')?.id).toBe('room');
    expect(findTech(stacks, 'JETPACK ROOM')?.id).toBe('room');
    expect(findTech(stacks, ' compose ')?.id).toBe('compose');
    expect(findTech(stacks, 'kótlin')?.id).toBe('kotlin');
    expect(findTech(stacks, 'hilt')).toBeUndefined(); // no item uses it
    expect(findTech(stacks, '')).toBeUndefined();
  });

  it('content validation rejects unknown and English-side stack ids', () => {
    const base = {
      status: 'published' as const,
      tags: [],
      review: 'pending' as const,
      importance: 3,
      related: [],
      links: [],
    };
    const errors = validateContent({
      tech: catalog,
      companies: [],
      notes: [],
      items: [
        {
          id: 'items/es/a',
          data: { ...base, type: 'app', title: 'A', stack: ['room', 'nope'] },
        },
        {
          id: 'items/en/a',
          data: { ...base, type: 'app', title: 'A', stack: ['room'] },
        },
        {
          id: 'items/es/b',
          data: { ...base, type: 'app', title: 'B', stack: ['room', 'room'] },
        },
      ],
    });
    expect([...errors].sort()).toEqual([
      'items: "a" has "stack" in its English file; put it in the Spanish one',
      'items: "a" has stack id "nope" that is not in tech.yaml',
      'items: "b" repeats an id in "stack"',
    ]);
  });
});
