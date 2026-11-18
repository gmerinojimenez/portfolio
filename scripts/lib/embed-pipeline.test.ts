import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runEmbed } from './embed-pipeline';

let root: string;
let content: string;
let data: string;

function writeItem(id: string, fields: string, body = 'Cuerpo.') {
  writeFileSync(
    join(content, 'items/es', `${id}.md`),
    `---\ntype: project\ntitle: ${id}\nstatus: published\nfrom: 2024\n${fields}---\n\n${body}\n`,
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'embed-'));
  content = join(root, 'content');
  data = join(root, 'data');
  mkdirSync(join(content, 'items/es'), { recursive: true });
  writeItem('uno', 'summary: Resumen uno\ntags: [android]\n');
  writeItem('dos', 'summary: Resumen dos\ntags: [llm]\nrelated: [uno]\n');
  // A draft must never reach the outputs.
  writeFileSync(
    join(content, 'items/es/borrador.md'),
    '---\ntype: project\ntitle: Borrador\n---\n',
  );
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const opts = { contentRoot: undefined as string | undefined, env: {} };
const run = (extra: Parameters<typeof runEmbed>[0] = {}) =>
  runEmbed({ ...opts, contentRoot: content, dataDir: data, ...extra });

describe('runEmbed', () => {
  it('writes both files from published content only', async () => {
    const result = await run();
    expect(result.computed).toEqual(['item/dos', 'item/uno']);
    const map = JSON.parse(readFileSync(join(data, 'map.json'), 'utf8'));
    expect(map.nodes.map((n: { id: string }) => n.id)).toEqual(['dos', 'uno']);
    expect(map.edges[0]).toMatchObject({ source: 'dos', target: 'uno' });
  });

  it('is idempotent and needs no key when nothing changed', async () => {
    await run();
    const before = readFileSync(join(data, 'map.json'), 'utf8');
    const result = await run({ env: { VOYAGE_API_KEY: undefined } });
    expect(result.computed).toEqual([]);
    expect(readFileSync(join(data, 'map.json'), 'utf8')).toBe(before);
    expect((await run({ check: true })).upToDate).toBe(true);
  });

  it('re-embeds only the item whose text changed', async () => {
    await run();
    writeItem('uno', 'summary: Resumen cambiado\ntags: [android]\n');
    const result = await run();
    expect(result.computed).toEqual(['item/uno']);
    expect(result.reused).toEqual(['item/dos']);
  });

  it('--check reports stale files without writing them', async () => {
    await run();
    writeItem('uno', 'summary: Otro\ntags: [android]\n');
    const result = await run({ check: true });
    expect(result.upToDate).toBe(false);
    expect((await run()).computed).toEqual(['item/uno']); // check did not write
  });

  it('uses Voyage when a key is set and refuses to mix with real vectors', async () => {
    const fetchFn = vi.fn((_url: string, init: RequestInit) => {
      const n = (JSON.parse(init.body as string) as { input: string[] }).input
        .length;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: Array.from({ length: n }, (_, index) => ({
              index,
              embedding: Array.from({ length: 256 }, (_, i) => (i + index) % 7),
            })),
          }),
        ),
      );
    }) as unknown as typeof fetch;

    const result = await run({ env: { VOYAGE_API_KEY: 'k' }, fetchFn });
    expect(result.provider).toBe('voyage');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    writeItem('tres', 'summary: Nuevo\ntags: [cloud]\n');
    await expect(run({ env: {} })).rejects.toThrow(/VOYAGE_API_KEY/);
    // ...and still no key needed for the unchanged content.
    rmSync(join(content, 'items/es/tres.md'));
    expect((await run({ env: {} })).computed).toEqual([]);
  });
});
