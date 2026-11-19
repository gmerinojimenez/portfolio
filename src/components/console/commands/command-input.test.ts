import { describe, expect, it } from 'vitest';
import { useTranslations } from '../../../i18n/ui';
import { commandFor, execute } from '../core/execute';
import { parseInput } from '../core/parse';
import type { Html } from '../core/html';
import type { CommandContext, FallbackHandler } from '../core/types';
import { sampleData } from '../sample-data';
import { createRegistry } from './index';

const registry = createRegistry();
const isCommand = (line: string) =>
  commandFor(parseInput(line), registry) !== undefined;

describe('command or question', () => {
  it('keeps real commands working, with and without arguments', () => {
    for (const line of [
      'help',
      'HELP',
      'whoami',
      'map',
      'ls',
      'ls --tag android',
      'ls -t android',
      'ls --tag=android',
      'ls --tag two words',
      'ls android',
      'cat',
      'cat some-id',
      'cv',
      'contact',
      'contacto',
      'lang es',
      'lang',
      'clear',
      'cls',
    ]) {
      expect(isCommand(line), line).toBe(true);
    }
  });

  it('sends a question that starts with a command name to the AI', () => {
    for (const line of [
      'help me with Kotlin',
      'help me',
      'contact me about the role',
      'contacto con la empresa',
      'map the experience of this person',
      'cat is a cute animal',
      'ls what is this',
      'ls --nonsense flag here',
      'lang what languages do you speak',
      'clear all doubts about Android',
      'whoami are you a robot',
      'cv de Android?',
    ]) {
      expect(isCommand(line), line).toBe(false);
    }
  });

  it('sends unknown words and sentences to the AI', () => {
    for (const line of [
      'hello',
      '¿Ha trabajado en apps con millones de usuarios?',
      'what do you do',
    ]) {
      expect(isCommand(line), line).toBe(false);
    }
  });

  it('runs the fallback for a question and the command otherwise', async () => {
    const asked: string[] = [];
    const registryWithAi = createRegistry().setFallback(((input) => {
      asked.push(input.raw);
    }) as FallbackHandler);
    const output: string[] = [];
    const ctx: CommandContext = {
      locale: 'en',
      t: useTranslations('en'),
      data: sampleData.en,
      registry: registryWithAi,
      pathname: '/en/',
      interactive: true,
      print: (content: Html) => output.push(content.value),
      clear: () => undefined,
      navigate: () => undefined,
      download: () => undefined,
      sleep: () => Promise.resolve(),
    };
    const run = (line: string) => execute(line, registryWithAi, () => ctx);

    const question = await run('help me with Kotlin');
    expect(question?.command).toBeUndefined();
    expect(asked).toEqual(['help me with Kotlin']);
    expect(output).toEqual([]);

    const command = await run('help');
    expect(command?.command?.name).toBe('help');
    expect(asked).toHaveLength(1);
    expect(output.join('')).toContain('available commands');
  });

  it('prints the "not configured" notice when no AI is plugged in', async () => {
    const output: string[] = [];
    const ctx: CommandContext = {
      locale: 'es',
      t: useTranslations('es'),
      data: sampleData.es,
      registry,
      pathname: '/es/',
      interactive: true,
      print: (content: Html) => output.push(content.value),
      clear: () => undefined,
      navigate: () => undefined,
      download: () => undefined,
      sleep: () => Promise.resolve(),
    };
    await execute('¿Qué experiencia tiene con Kotlin?', registry, () => ctx);
    const html = output.join('');
    expect(html).toContain('todavía no está disponible');
    expect(html).toContain('data-cmd="ls"');
    expect(html).toContain('data-cmd="contacto"');
    expect(html).toContain('data-cmd="help"');
  });
});
