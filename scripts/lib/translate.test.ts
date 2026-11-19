import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { splitFrontmatter } from './content-source';
import {
  createClaudeTranslator,
  createFakeTranslator,
  hashSource,
  parseTranslation,
  planAction,
  runTranslate,
  validateTranslation,
  type TextFields,
  type Translator,
} from './translate';

const source: TextFields = {
  title: 'Título',
  summary: 'Resumen',
  tags: ['android', 'kotlin'],
  body: 'Texto con [enlace](https://example.com/x)\n\n```kt\nval a = 1\n```\n',
};

describe('hashSource and planAction', () => {
  it('only changes with the translatable text', () => {
    expect(hashSource(source)).toBe(hashSource({ ...source }));
    expect(hashSource(source)).toBe(
      hashSource({ ...source, body: `\n${source.body}\n\n` }),
    );
    expect(hashSource(source)).not.toBe(
      hashSource({ ...source, title: 'Otro' }),
    );
    expect(hashSource(source)).not.toBe(hashSource({ ...source, tags: [] }));
  });

  it('follows the decision table', () => {
    const h = 'abc';
    expect(planAction(h, undefined)).toBe('create');
    expect(planAction(h, { review: 'pending', sourceHash: h })).toBe('skip');
    expect(planAction(h, { review: 'reviewed', sourceHash: h })).toBe('skip');
    expect(planAction(h, { review: 'pending', sourceHash: 'x' })).toBe(
      'retranslate',
    );
    expect(planAction(h, { review: 'pending' })).toBe('retranslate');
    expect(planAction(h, { review: 'reviewed', sourceHash: 'x' })).toBe(
      'retranslate-reviewed',
    );
    expect(planAction(h, { review: 'reviewed' })).toBe('unhashed-reviewed');
  });
});

describe('validateTranslation', () => {
  const good: TextFields = { ...source, title: 'Title' };
  it('accepts a faithful translation', () => {
    expect(validateTranslation(source, good)).toEqual([]);
  });
  it('rejects broken structure', () => {
    expect(validateTranslation(source, { ...good, tags: ['android'] })).toEqual(
      ['expected 2 tags, got 1'],
    );
    expect(
      validateTranslation(source, { ...good, body: 'No code and no link' }),
    ).toEqual(
      expect.arrayContaining([
        'code fence count differs',
        'URL missing: https://example.com/x',
      ]),
    );
    expect(validateTranslation(source, { ...good, title: ' ' })).toContain(
      'empty title',
    );
  });
});

describe('Claude translator (simulated client)', () => {
  const answer = (text: string, stop_reason = 'end_turn') => ({
    stop_reason,
    content: [{ type: 'text', text }],
  });
  const clientWith = (response: unknown) => {
    const create = vi.fn(() => Promise.resolve(response));
    return {
      create,
      client: { messages: { create } } as unknown as Parameters<
        typeof createClaudeTranslator
      >[0] extends infer O
        ? O extends { client?: infer C }
          ? C
          : never
        : never,
    };
  };

  it('asks for structured output with Haiku 5.5 and parses the answer', async () => {
    const { create, client } = clientWith(
      answer(
        JSON.stringify({
          title: ' Title ',
          summary: 'Sum\nmary',
          tags: ['android', 'kotlin'],
          body: 'Text with [link](https://example.com/x)\n\n```kt\nval a = 1\n```',
        }),
      ),
    );
    const translator = createClaudeTranslator({ client });
    const out = await translator.translate(source);
    expect(out).toMatchObject({ title: 'Title', summary: 'Sum mary' });
    const request = (create.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(request.model).toBe('claude-haiku-5-5');
    expect(request.output_config).toMatchObject({
      effort: 'low',
      format: { type: 'json_schema' },
    });
    expect(request).not.toHaveProperty('temperature');
  });

  it('fails on refusals, truncation and malformed JSON', async () => {
    for (const [response, message] of [
      [answer('{}', 'refusal'), /declined/],
      [answer('{}', 'max_tokens'), /cut off/],
      [answer('not json'), /valid JSON/],
      [answer('{"title":1}'), /expected shape/],
    ] as const) {
      const { client } = clientWith(response);
      await expect(
        createClaudeTranslator({ client }).translate(source),
      ).rejects.toThrow(message);
    }
  });

  it('parseTranslation drops the summary when the source has none', () => {
    const out = parseTranslation(
      '{"title":"T","summary":"","tags":[],"body":""}',
      { title: 'x', tags: [], body: '' },
    );
    expect(out).not.toHaveProperty('summary');
  });
});

// ---------------------------------------------------------------- pipeline

let root: string;
let logFile: string;

const esItem = (id: string, extra = '', body = 'Cuerpo uno.') =>
  writeFileSync(
    join(root, 'items/es', `${id}.md`),
    `---\ntype: project\ntitle: Título ${id}\nstatus: published\nfrom: 2024\nsummary: Resumen ${id}\ntags: [android, kotlin]\n${extra}---\n\n${body}\n`,
  );
const readEn = (id: string) =>
  splitFrontmatter(readFileSync(join(root, 'items/en', `${id}.md`), 'utf8'));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'translate-'));
  logFile = join(root, 'log/translation-log.md');
  mkdirSync(join(root, 'items/es'), { recursive: true });
  mkdirSync(join(root, 'notes/es'), { recursive: true });
  mkdirSync(join(root, 'fixtures/items/es'), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const counting = (): Translator & { calls: number } => {
  const inner = createFakeTranslator();
  const t = {
    calls: 0,
    model: inner.model,
    translate(s: TextFields) {
      t.calls++;
      return inner.translate(s);
    },
  };
  return t;
};
const run = (translator: Translator, extra = {}) =>
  runTranslate({ contentRoot: root, translator, logFile, ...extra });

describe('runTranslate', () => {
  it('creates a pending English file with only the translatable fields', async () => {
    esItem('uno', 'related: []\nimportance: 5\n');
    const result = await run(createFakeTranslator());
    expect(result.created).toEqual(['item/uno']);
    const { data, body } = readEn('uno');
    expect(Object.keys(data)).toEqual([
      'type',
      'title',
      'review',
      'sourceHash',
      'summary',
      'tags',
    ]);
    expect(data).toMatchObject({
      type: 'project',
      review: 'pending',
      title: '[EN fake] Título uno',
      tags: ['android', 'kotlin'],
    });
    expect(data.sourceHash).toBe(
      hashSource({
        title: 'Título uno',
        summary: 'Resumen uno',
        tags: ['android', 'kotlin'],
        body: 'Cuerpo uno.',
      }),
    );
    expect(body).toContain('Cuerpo uno.');
  });

  it('writes tags the way Prettier formats them', async () => {
    esItem('uno');
    await run(createFakeTranslator());
    const raw = readFileSync(join(root, 'items/en', 'uno.md'), 'utf8');
    expect(raw).toContain('\ntags: [android, kotlin]\n');
  });

  it('does not call the translator again for an unchanged source', async () => {
    esItem('uno');
    const t = counting();
    await run(t);
    await run(t);
    expect(t.calls).toBe(1);
    // Non-text changes do not count either.
    esItem('uno', 'importance: 1\n');
    await run(t);
    expect(t.calls).toBe(1);
  });

  it('retranslates a pending file when the source changes', async () => {
    esItem('uno');
    const t = counting();
    await run(t);
    esItem('uno', '', 'Cuerpo dos.');
    const result = await run(t);
    expect(result.retranslated).toEqual(['item/uno']);
    expect(readEn('uno').body).toContain('Cuerpo dos.');
  });

  it('never touches a reviewed file with the same hash', async () => {
    esItem('uno');
    await run(createFakeTranslator());
    const path = join(root, 'items/en/uno.md');
    const edited = readFileSync(path, 'utf8')
      .replace('review: pending', 'review: reviewed')
      .replace('[EN fake] Título uno', 'Hand-polished title');
    writeFileSync(path, edited);
    const t = counting();
    await run(t);
    expect(t.calls).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(edited);
  });

  it('reopens a reviewed file when the source changed and logs what changed', async () => {
    esItem('uno');
    await run(createFakeTranslator());
    const path = join(root, 'items/en/uno.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace('review: pending', 'review: reviewed'),
    );
    esItem('uno', '', 'Cuerpo nuevo.');
    const result = await run(createFakeTranslator(), {
      now: () => new Date('2026-11-18T10:00:00Z'),
    });
    expect(result.reopened).toEqual(['item/uno']);
    expect(readEn('uno').data.review).toBe('pending');
    const log = readFileSync(logFile, 'utf8');
    expect(log).toContain('## 2026-11-18 item/uno');
    expect(log).toContain('Changed in English: body');
    expect(log).toContain('Previous title: [EN fake] Título uno');
  });

  it('warns about a reviewed file without hash and adopts it on request', async () => {
    esItem('uno');
    mkdirSync(join(root, 'items/en'), { recursive: true });
    const path = join(root, 'items/en/uno.md');
    const manual =
      '---\ntype: project\ntitle: Mine\nreview: reviewed\nsummary: S\ntags: [android, kotlin]\n---\n\nManual text.\n';
    writeFileSync(path, manual);

    const t = counting();
    const warned = await run(t);
    expect(warned.warnings[0]).toMatch(/--adopt/);
    expect(t.calls).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(manual);

    const adopted = await run(t, { adopt: true });
    expect(adopted.adopted).toEqual(['item/uno']);
    const { data, body } = readEn('uno');
    expect(data).toMatchObject({ title: 'Mine', review: 'reviewed' });
    expect(data.sourceHash).toBeTruthy();
    expect(body).toContain('Manual text.');
    expect((await run(t)).skipped).toEqual(['item/uno']);
    expect(t.calls).toBe(0);
  });

  it('skips drafts and fixtures unless asked', async () => {
    writeFileSync(
      join(root, 'items/es/borrador.md'),
      '---\ntype: project\ntitle: B\n---\n',
    );
    writeFileSync(
      join(root, 'fixtures/items/es/demo-x.md'),
      '---\ntype: project\ntitle: X\nstatus: published\nfrom: 2024\nsummary: s\ntags: [a]\n---\n\ncuerpo\n',
    );
    const t = counting();
    await run(t);
    expect(t.calls).toBe(0);
    const withFixtures = await run(t, { includeFixtures: true });
    expect(withFixtures.created).toEqual(['item/demo-x']);
    expect(existsSync(join(root, 'fixtures/items/en/demo-x.md'))).toBe(true);
  });

  it('translates notes too (no type in the frontmatter)', async () => {
    writeFileSync(
      join(root, 'notes/es/nota.md'),
      '---\ntitle: Nota\nstatus: published\nsummary: s\ntags: [notes]\n---\n\ncuerpo\n',
    );
    await run(createFakeTranslator());
    const en = splitFrontmatter(
      readFileSync(join(root, 'notes/en/nota.md'), 'utf8'),
    );
    expect(en.data).not.toHaveProperty('type');
    expect(en.data.review).toBe('pending');
  });

  it('writes nothing for an invalid translation and reports it', async () => {
    esItem('uno', '', 'Con [enlace](https://example.com/y)');
    esItem('dos');
    const broken: Translator = {
      model: 'broken',
      translate: (s) =>
        Promise.resolve({
          ...s,
          body: s.title === 'Título uno' ? 'sin enlace' : s.body,
        }),
    };
    const result = await run(broken);
    expect(result.errors[0]).toMatch(/URL missing/);
    expect(existsSync(join(root, 'items/en/uno.md'))).toBe(false);
    expect(result.created).toEqual(['item/dos']); // the rest keeps going
  });

  it('--dry-run lists the work without a translator or writing files', async () => {
    esItem('uno');
    const result = await runTranslate({
      contentRoot: root,
      dryRun: true,
      logFile,
    });
    expect(result.created).toEqual(['item/uno']);
    expect(existsSync(join(root, 'items/en/uno.md'))).toBe(false);
  });
});
