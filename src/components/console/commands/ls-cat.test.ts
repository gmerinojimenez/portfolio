import { describe, expect, it } from 'vitest';
import type { Locale } from '../../../lib/locales';
import { useTranslations } from '../../../i18n/ui';
import { complete } from '../core/complete';
import { execute } from '../core/execute';
import type { CommandContext } from '../core/types';
import { sampleData } from '../sample-data';
import { suggestIds } from './cat';
import { createRegistry } from './index';
import { parseLsArgs } from './ls';

function fakeConsole(locale: Locale = 'es') {
  const registry = createRegistry();
  const output: string[] = [];
  const ctx: CommandContext = {
    locale,
    t: useTranslations(locale),
    data: sampleData[locale],
    registry,
    pathname: `/${locale}/`,
    interactive: true,
    print: (content) => output.push(content.value),
    clear: () => output.splice(0),
    navigate: () => {},
    openTab: () => {},
    sleep: () => Promise.resolve(),
  };
  return {
    ctx,
    registry,
    run: (line: string) => execute(line, registry, () => ctx),
    text: () => output.join('\n'),
  };
}

describe('ls', () => {
  it('parses its arguments', () => {
    expect(parseLsArgs([])).toEqual({ kind: 'all' });
    expect(parseLsArgs(['--tag', 'android'])).toEqual({
      kind: 'tag',
      tag: 'android',
    });
    expect(parseLsArgs(['-t', 'machine', 'learning'])).toEqual({
      kind: 'tag',
      tag: 'machine learning',
    });
    expect(parseLsArgs(['--tag=ai'])).toEqual({ kind: 'tag', tag: 'ai' });
    expect(parseLsArgs(['--tag'])).toEqual({ kind: 'invalid' });
    expect(parseLsArgs(['android'])).toEqual({ kind: 'invalid' });
  });

  it('lists every item, most important first, as cat buttons', async () => {
    const c = fakeConsole('es');
    await c.run('ls');
    const text = c.text();
    expect(text).toContain('data-cmd="cat test-bank-app"');
    expect(text).toContain('data-cmd="cat test-offline-sync"');
    expect(text.indexOf('test-bank-app')).toBeLessThan(
      text.indexOf('test-evals-post'),
    );
    // Titles are escaped.
    expect(text).toContain('LLM evals &lt;post&gt;');
    // Tags are filter buttons.
    expect(text).toContain('data-cmd="ls --tag android"');
  });

  it('filters by tag, case-insensitively', async () => {
    const c = fakeConsole('es');
    await c.run('ls --tag ANDROID');
    const text = c.text();
    expect(text).toContain('cat test-bank-app');
    expect(text).toContain('cat test-offline-sync');
    expect(text).not.toContain('cat test-evals-post');
    expect(text).toContain('filtrado por');
  });

  it('explains unknown tags and bad arguments', async () => {
    const c = fakeConsole('en');
    await c.run('ls --tag cobol');
    expect(c.text()).toContain('nothing tagged');
    await c.run('ls android');
    expect(c.text()).toContain('usage: ls [--tag &lt;tag&gt;]');
  });

  it('completes the flag and the tags', () => {
    const { registry, ctx } = fakeConsole('es');
    expect(complete('ls --t', registry, ctx).value).toBe('ls --tag ');
    expect(complete('ls --tag k', registry, ctx).value).toBe(
      'ls --tag kotlin ',
    );
    expect(complete('ls --tag a', registry, ctx).candidates).toEqual([
      'android',
      'ai',
    ]);
  });
});

describe('cat', () => {
  it('prints a link to the item page that the browser turns into a card', async () => {
    const c = fakeConsole('en');
    await c.run('cat test-bank-app');
    expect(c.text()).toContain('data-card-id="test-bank-app"');
    expect(c.text()).toContain('href="/en/projects/test-bank-app/"');
  });

  it('explains usage and suggests ids', async () => {
    const c = fakeConsole('es');
    await c.run('cat');
    expect(c.text()).toContain('uso: cat &lt;id&gt;');
    await c.run('cat test-bank');
    expect(c.text()).toContain('cat: no existe');
    expect(c.text()).toContain('data-cmd="cat test-bank-app"');
  });

  it('completes ids', () => {
    const { registry, ctx } = fakeConsole('es');
    expect(complete('cat test-o', registry, ctx).value).toBe(
      'cat test-offline-sync ',
    );
  });

  it('suggests prefix matches before substring matches', () => {
    expect(suggestIds('app', ['my-app', 'app-one', 'other'])).toEqual([
      'app-one',
      'my-app',
    ]);
    expect(suggestIds('', ['a'])).toEqual([]);
  });
});
