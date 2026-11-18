import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseAiContext } from './context';
import {
  buildAiContext,
  readContentSnapshot,
  writeAiContext,
} from './context-builder';

/** A tiny content tree written to a temp dir, independent of the real fixtures. */
const root = mkdtempSync(join(tmpdir(), 'ai-context-'));
const write = (path: string, text: string) => {
  const file = join(root, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
};

write('companies/acme.yaml', 'name: Acme\nlocation: Madrid\n');
write(
  'items/es/app.md',
  `---
type: app
title: App de banca
status: published
from: 2019-03
to: present
company: acme
summary: Una app.
tags: [android, kotlin]
related: [lib]
role: Lead
---
Cuerpo en español.
`,
);
write(
  'items/en/app.md',
  `---
type: app
title: Banking app
review: reviewed
summary: An app.
tags: [android]
---
English body.
`,
);
write(
  'items/es/lib.md',
  `---
type: oss
title: Librería
status: published
from: 2022
summary: Una librería.
tags: [kotlin]
---
Sin traducción revisada.
`,
);
write(
  'items/es/draft.md',
  '---\ntype: project\ntitle: Borrador secreto\n---\nNo.\n',
);
write(
  'notes/es/nota.md',
  `---
title: Nota
status: published
summary: Una nota.
tags: [notes]
related: [app]
---
Texto de la nota.
`,
);
write(
  'fixtures/items/es/demo-x.md',
  `---
type: post
title: Demo
status: published
from: 2026
summary: Ejemplo.
tags: [ai]
---
Demo.
`,
);
write('_templates/item.md', '---\ntype: app\ntitle: Plantilla\n---\n');

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('AI context builder', () => {
  const context = buildAiContext(readContentSnapshot(root));

  it('includes only published items and notes, tagged by id', () => {
    const es = context.locales.es;
    expect(es.sources.map((s) => `${s.kind}:${s.id}`)).toEqual([
      'item:app',
      'item:demo-x',
      'item:lib',
      'note:nota',
    ]);
    expect(es.document).toContain('<item id="app" type="app" lang="es">');
    expect(es.document).toContain('<note id="nota" lang="es">');
    expect(es.document).not.toContain('Borrador secreto');
    expect(es.document).not.toContain('Plantilla');
    expect(es.document.startsWith('<portfolio_content locale="es">')).toBe(
      true,
    );
    expect(es.document.trim().endsWith('</portfolio_content>')).toBe(true);
  });

  it('renders structure, resolved company and dates', () => {
    const es = context.locales.es.document;
    expect(es).toContain('company: Acme (Madrid)');
    expect(es).toContain('dates: 2019-03 – actualidad');
    expect(es).toContain('role: Lead');
    expect(es).toContain('related: lib');
    expect(es).toContain('Cuerpo en español.');
  });

  it('uses reviewed English and falls back to Spanish otherwise', () => {
    const en = context.locales.en.document;
    expect(en).toContain('<item id="app" type="app" lang="en">');
    expect(en).toContain('title: Banking app');
    expect(en).toContain('English body.');
    expect(en).toContain('dates: 2019-03 – present');
    // Structure still comes from the Spanish source.
    expect(en).toContain('company: Acme (Madrid)');
    expect(en).toContain('<item id="lib" type="oss" lang="es">');
    expect(context.locales.en.sources.find((s) => s.id === 'app')?.title).toBe(
      'Banking app',
    );
  });

  it('can be limited to fixtures (for the eval)', () => {
    const fixtures = buildAiContext(readContentSnapshot(root), {
      fixturesOnly: true,
    });
    expect(fixtures.locales.es.sources.map((s) => s.id)).toEqual(['demo-x']);
  });

  it('is deterministic, so prompt caching keeps hitting', () => {
    expect(buildAiContext(readContentSnapshot(root))).toEqual(context);
  });

  it('fails on invalid content', () => {
    write(
      'items/es/broken.md',
      '---\ntype: app\ntitle: X\nrelated: [nope]\n---\n',
    );
    expect(() => readContentSnapshot(root)).toThrow(/nope/);
    rmSync(join(root, 'items/es/broken.md'));
  });

  it('writes a file the Lambda can load', () => {
    const out = join(root, '..', `${root.split('/').pop()}-out`);
    const { path } = writeAiContext(root, out);
    expect(parseAiContext(readFileSync(path, 'utf8'))).toEqual(context);
    rmSync(out, { recursive: true, force: true });
  });

  it('builds from the real src/content without errors', () => {
    const real = buildAiContext(readContentSnapshot('src/content'));
    for (const locale of ['es', 'en'] as const) {
      const ids = real.locales[locale].sources.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
