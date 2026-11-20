import { describe, expect, it } from 'vitest';
import {
  cvPath,
  fitsLens,
  isHiddenCvPath,
  MAX_BULLETS,
  parseCvConfig,
  selectCv,
  trackFromSlug,
  validateCvConfig,
  type CvConfig,
  type CvItem,
} from './cv';
import { parseTechCatalog } from './tech';

const catalog = parseTechCatalog(`
- id: android
  label: { es: Android, en: Android }
  techs:
    - { id: compose, name: Jetpack Compose }
- id: ai
  label: { es: IA, en: AI }
  techs:
    - { id: rag, name: RAG }
- id: languages
  label: { es: Lenguajes, en: Languages }
  techs:
    - { id: kotlin, name: Kotlin }
`);

const lens = (stacks: string[], extra = '') => `
  summary: { es: Resumen, en: Summary }
  stacks: [${stacks.join(', ')}]
${extra}`;

const config: CvConfig = parseCvConfig(`
general:${lens(['android', 'ai', 'languages'])}
ai:${lens(['ai', 'languages', 'android'])}
android:${lens(['android', 'languages', 'ai'])}
`);

let n = 0;
const item = (data: Partial<CvItem>): CvItem => ({
  id: `item-${++n}`,
  type: 'project',
  importance: 3,
  personal: false,
  cert: false,
  stackIds: [],
  ...data,
});

const companies = [
  { id: 'merlyn', stage: 'merlyn' },
  { id: 'tuenti', stage: 'tuenti' },
  { id: 'ucm' },
];

describe('cv paths', () => {
  it('builds the public and the hidden paths per language', () => {
    expect(cvPath('general', 'es')).toBe('/es/cv/');
    expect(cvPath('ai', 'es')).toBe('/es/cv/ia/');
    expect(cvPath('ai', 'en')).toBe('/en/cv/ai/');
    expect(cvPath('android', 'en')).toBe('/en/cv/android/');
    expect(trackFromSlug('ia', 'es')).toBe('ai');
    expect(trackFromSlug('ia', 'en')).toBeUndefined();
  });

  it('only the lens pages are hidden', () => {
    expect(isHiddenCvPath('/es/cv/ia/')).toBe(true);
    expect(isHiddenCvPath('/en/cv/android/')).toBe(true);
    expect(isHiddenCvPath('/es/cv/')).toBe(false);
    expect(isHiddenCvPath('/en/cv/ia/')).toBe(false);
    expect(isHiddenCvPath('/es/proyectos/ia/')).toBe(false);
  });
});

describe('cv config', () => {
  it('reports unknown items and stacks', () => {
    const broken = parseCvConfig(`
general:${lens(['android', 'nope'])}
ai:${lens(['ai'], '  include: [ghost]')}
android:${lens(['android'], '  exclude: [real]')}
`);
    expect(validateCvConfig(broken, new Set(['real']), catalog)).toEqual([
      'cv.general: unknown stack "nope"',
      'cv.ai: unknown item "ghost"',
    ]);
  });

  it('rejects a lens without summary', () => {
    expect(() =>
      parseCvConfig(`
general:
  stacks: [android]
ai:${lens(['ai'])}
android:${lens(['android'])}
`),
    ).toThrow();
  });
});

describe('fitsLens', () => {
  it('matches by topic or by a technology of the lens stack', () => {
    expect(fitsLens(item({ topic: 'ai' }), 'ai', catalog)).toBe(true);
    expect(fitsLens(item({ stackIds: ['rag'] }), 'ai', catalog)).toBe(true);
    expect(fitsLens(item({ stackIds: ['kotlin'] }), 'ai', catalog)).toBe(false);
    expect(fitsLens(item({ topic: 'backend' }), 'general', catalog)).toBe(true);
  });
});

describe('selectCv', () => {
  const assistant = item({
    id: 'assistant',
    type: 'app',
    topic: 'ai',
    importance: 5,
    companyId: 'merlyn',
    role: 'Senior Software Engineer',
    from: '2023-10',
    to: 'present',
  });
  const clients = item({
    id: 'clients',
    topic: 'kotlin',
    companyId: 'merlyn',
    from: '2023-10',
    stackIds: ['compose'],
  });
  const tuentiApp = item({
    id: 'tuenti-app',
    type: 'app',
    topic: 'android',
    importance: 5,
    companyId: 'tuenti',
    role: 'Senior Software Engineer',
    from: '2015-04',
    to: '2023-10',
  });
  const tuentiExtras = [1, 2, 3, 4, 5].map((i) =>
    item({
      id: `tuenti-${i}`,
      topic: 'android',
      importance: i,
      companyId: 'tuenti',
      from: '2017',
    }),
  );
  const mcp = item({
    id: 'mcp',
    type: 'oss',
    topic: 'ai',
    personal: true,
    from: '2026-11',
  });
  const post = item({ id: 'post', type: 'post', topic: 'android' });
  const degree = item({
    id: 'degree',
    type: 'education',
    companyId: 'ucm',
    from: '2005',
  });
  const aiCert = item({
    id: 'ai-cert',
    type: 'education',
    topic: 'ai',
    cert: true,
    from: '2026-10',
  });
  const androidCert = item({
    id: 'android-cert',
    type: 'education',
    topic: 'android',
    cert: true,
    from: '2015',
  });
  const items = [
    assistant,
    clients,
    tuentiApp,
    ...tuentiExtras,
    mcp,
    post,
    degree,
    aiCert,
    androidCert,
  ];
  const select = (lens: 'general' | 'ai' | 'android', cfg = config) =>
    selectCv({ items, companies, catalog, config: cfg, lens });

  it('lists companies with a stage, most recent first, with role and span', () => {
    const { experience } = select('general');
    expect(experience.map((e) => e.companyId)).toEqual(['merlyn', 'tuenti']);
    expect(experience[0]).toMatchObject({
      role: 'Senior Software Engineer',
      from: '2023-10',
      to: 'present',
    });
    expect(experience[1]).toMatchObject({ from: '2015-04', to: '2023-10' });
  });

  it('caps the bullets per company, most important first', () => {
    const tuenti = select('general').experience[1];
    expect(tuenti?.bullets.map((b) => b.id)).toEqual([
      'tuenti-app',
      'tuenti-5',
      'tuenti-4',
      'tuenti-3',
    ]);
    expect(tuenti?.bullets).toHaveLength(MAX_BULLETS);
  });

  it('filters bullets by lens, keeping a company with nothing on it briefly', () => {
    const ai = select('ai');
    expect(ai.experience[0]?.bullets.map((b) => b.id)).toEqual(['assistant']);
    expect(ai.experience[1]).toMatchObject({ offLens: true });
    expect(ai.experience[1]?.bullets.map((b) => b.id)).toEqual(['tuenti-app']);

    const android = select('android');
    // `clients` uses Compose, so it is Android work too.
    expect(android.experience[0]?.bullets.map((b) => b.id)).toEqual([
      'clients',
    ]);
  });

  it('applies include and exclude last', () => {
    const custom = parseCvConfig(`
general:${lens(['android'])}
ai:${lens(['ai'], '  include: [tuenti-1]\n  exclude: [assistant]')}
android:${lens(['android'])}
`);
    const ai = select('ai', custom);
    // Nothing of Merlyn fits once `assistant` is out: one bullet, not that one.
    expect(ai.experience[0]?.bullets.map((b) => b.id)).toEqual(['clients']);
    expect(ai.experience[0]?.offLens).toBe(true);
    expect(ai.experience[1]?.bullets.map((b) => b.id)).toEqual(['tuenti-1']);
  });

  it('picks projects and certificates by lens, degrees always', () => {
    const ai = select('ai');
    expect(ai.projects.map((p) => p.id)).toEqual(['mcp']);
    expect(ai.certificates.map((c) => c.id)).toEqual(['ai-cert']);
    expect(ai.education.map((e) => e.id)).toEqual(['degree']);

    const android = select('android');
    expect(android.projects.map((p) => p.id)).toEqual(['post']);
    expect(android.certificates.map((c) => c.id)).toEqual(['android-cert']);

    const general = select('general');
    expect(general.certificates.map((c) => c.id)).toEqual([
      'ai-cert',
      'android-cert',
    ]);
  });

  it('orders the skills by the lens stacks', () => {
    expect(select('ai').stacks).toEqual(['ai', 'languages', 'android']);
  });
});
