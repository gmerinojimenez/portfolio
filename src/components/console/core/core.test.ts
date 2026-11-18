import { describe, expect, it } from 'vitest';
import { Animator, typeInto } from './animator';
import { History } from './history';
import { escapeHtml, join, markup, raw } from './html';
import { parseInput } from './parse';
import { CommandRegistry } from './registry';
import type { Command } from './types';

const noop: Command['run'] = () => {};
const cmd = (name: string, extra: Partial<Command> = {}): Command => ({
  name,
  summary: { es: name, en: name },
  run: noop,
  ...extra,
});

describe('markup', () => {
  it('escapes interpolated strings', () => {
    expect(markup`<p>${'<b>"x" & \'y\'</b>'}</p>`.value).toBe(
      '<p>&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;</p>',
    );
  });

  it('keeps nested templates and raw values', () => {
    const inner = markup`<i>${'a<b'}</i>`;
    expect(markup`<p>${inner}${raw('<br>')}</p>`.value).toBe(
      '<p><i>a&lt;b</i><br></p>',
    );
  });

  it('renders arrays and skips null, undefined and false', () => {
    expect(
      markup`${['a', markup`<b>b</b>`]}${null}${undefined}${false}${0}`.value,
    ).toBe('a<b>b</b>0');
  });

  it('joins with an escaped separator', () => {
    expect(join([markup`<a></a>`, '<x>'], ' & ').value).toBe(
      '<a></a> &amp; &lt;x&gt;',
    );
    expect(escapeHtml('plain')).toBe('plain');
  });
});

describe('parseInput', () => {
  it('splits name and arguments', () => {
    expect(parseInput('  LANG   en  ')).toEqual({
      raw: 'LANG   en',
      name: 'lang',
      args: ['en'],
      argText: 'en',
    });
  });

  it('handles empty input and free text', () => {
    expect(parseInput('   ').name).toBe('');
    const q = parseInput('¿Ha trabajado con IA?');
    expect(q.name).toBe('¿ha');
    expect(q.argText).toBe('trabajado con IA?');
  });
});

describe('CommandRegistry', () => {
  it('resolves names, localized names and aliases case-insensitively', () => {
    const contact = cmd('contacto', {
      names: { es: 'contacto', en: 'contact' },
      aliases: ['mail'],
    });
    const registry = new CommandRegistry().register(contact);
    expect(registry.resolve('CONTACTO')).toBe(contact);
    expect(registry.resolve('contact')).toBe(contact);
    expect(registry.resolve('mail')).toBe(contact);
    expect(registry.resolve('nope')).toBeUndefined();
    expect(registry.displayName(contact, 'en')).toBe('contact');
    expect(registry.displayName(contact, 'es')).toBe('contacto');
  });

  it('rejects duplicates unless replacing, keeping the order', () => {
    const registry = new CommandRegistry()
      .register(cmd('help'))
      .register(cmd('map', { aliases: ['m'] }))
      .register(cmd('clear'));
    expect(() => registry.register(cmd('map'))).toThrow(/already registered/);
    expect(() =>
      registry.register(cmd('other', { aliases: ['help'] })),
    ).toThrow(/already used/);

    const newMap = cmd('map');
    registry.register(newMap, { replace: true });
    expect(registry.list().map((c) => c.name)).toEqual([
      'help',
      'map',
      'clear',
    ]);
    expect(registry.resolve('map')).toBe(newMap);
    expect(registry.resolve('m')).toBeUndefined();
  });

  it('restores the previous command when a replacement conflicts', () => {
    const map = cmd('map', { aliases: ['m'] });
    const registry = new CommandRegistry().register(cmd('help')).register(map);
    expect(() =>
      registry.register(cmd('map', { aliases: ['help'] }), { replace: true }),
    ).toThrow();
    expect(registry.resolve('m')).toBe(map);
  });

  it('hides hidden commands from help and completion', () => {
    const registry = new CommandRegistry()
      .register(cmd('help'))
      .register(cmd('secret', { hidden: true }));
    expect(registry.visible().map((c) => c.name)).toEqual(['help']);
    expect(registry.completionNames('es')).toEqual(['help']);
    expect(registry.has('secret')).toBe(true);
  });

  it('stores a fallback handler', () => {
    const fallback = () => {};
    expect(new CommandRegistry().setFallback(fallback).fallback).toBe(fallback);
  });
});

describe('History', () => {
  it('walks back and forth and restores the draft', () => {
    const history = new History();
    history.push('help');
    history.push('whoami');
    expect(history.previous('dra')).toBe('whoami');
    expect(history.previous('whoami')).toBe('help');
    expect(history.previous('help')).toBeUndefined();
    expect(history.next()).toBe('whoami');
    expect(history.next()).toBe('dra');
    expect(history.next()).toBeUndefined();
  });

  it('ignores empty entries and consecutive duplicates, and caps its size', () => {
    const history = new History(['a'], 3);
    history.push('  ');
    history.push('b');
    history.push('b');
    history.push('c');
    history.push('d');
    expect(history.entries).toEqual(['b', 'c', 'd']);
  });

  it('does nothing when empty', () => {
    const history = new History();
    expect(history.previous('x')).toBeUndefined();
    expect(history.next()).toBeUndefined();
  });
});

describe('Animator', () => {
  it('is instant with reduced motion', async () => {
    const waits: number[] = [];
    const animator = new Animator(true, async (ms) => {
      waits.push(ms);
    });
    await animator.sleep(100);
    expect(waits).toEqual([]);
    expect(animator.instant).toBe(true);
  });

  it('resolves pending pauses on skip until resumed', async () => {
    const animator = new Animator(false, () => new Promise(() => {}));
    const pending = animator.sleep(1000);
    animator.skip();
    await expect(pending).resolves.toBeUndefined();
    expect(animator.instant).toBe(true);
    animator.resume();
    expect(animator.instant).toBe(false);
  });

  it('types text and finishes it when skipped', async () => {
    const target = { textContent: '' as string | null };
    const animator = new Animator(false, async () => {
      animator.skip();
    });
    await typeInto(target, 'whoami', animator);
    expect(target.textContent).toBe('whoami');
  });
});
