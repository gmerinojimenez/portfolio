import { describe, expect, it } from 'vitest';
import type { Locale } from '../../../lib/locales';
import { useTranslations } from '../../../i18n/ui';
import { renderBoot } from '../boot';
import { complete } from '../core/complete';
import { execute } from '../core/execute';
import type { Html } from '../core/html';
import type { CommandContext } from '../core/types';
import type { ConsoleData } from '../data';
import { quickCommands } from '../quick-commands';
import { sampleData } from '../sample-data';
import { createRegistry } from './index';

function fakeConsole(
  locale: Locale = 'es',
  options: { pathname?: string; data?: ConsoleData; company?: string } = {},
) {
  const registry = createRegistry();
  const output: string[] = [];
  const navigations: string[] = [];
  const downloads: string[] = [];
  let cleared = 0;
  const ctx: CommandContext = {
    locale,
    t: useTranslations(locale),
    data: options.data ?? sampleData[locale],
    registry,
    pathname: options.pathname ?? `/${locale}/`,
    interactive: true,
    company: options.company,
    print: (content: Html) => output.push(content.value),
    clear: () => {
      cleared += 1;
      output.splice(0);
    },
    navigate: (url) => navigations.push(url),
    download: (url) => downloads.push(url),
    sleep: () => Promise.resolve(),
  };
  const run = (line: string) => execute(line, registry, () => ctx);
  return {
    registry,
    ctx,
    output,
    navigations,
    downloads,
    run,
    get cleared() {
      return cleared;
    },
    text: () => output.join('\n'),
  };
}

describe('built-in commands', () => {
  it('help lists visible commands with localized names', async () => {
    const es = fakeConsole('es');
    await es.run('help');
    expect(es.text()).toContain('data-cmd="contacto"');
    expect(es.text()).toContain('lang es|en');
    expect(es.text()).toContain('comandos disponibles');

    const en = fakeConsole('en');
    await en.run('HELP');
    expect(en.text()).toContain('data-cmd="contact"');
    expect(en.text()).not.toContain('data-cmd="contacto"');
  });

  it('whoami prints the profile', async () => {
    const c = fakeConsole('en');
    await c.run('whoami');
    expect(c.text()).toContain(sampleData.en.profile.headline);
    expect(c.text()).toContain('<p class="c-hero-name">');
  });

  it('clear empties the output', async () => {
    const c = fakeConsole();
    await c.run('help');
    await c.run('clear');
    expect(c.output).toEqual([]);
    expect(c.cleared).toBe(1);
  });

  it('lang navigates to the same page in the other language', async () => {
    const c = fakeConsole('es', { pathname: '/es/proyectos/x/' });
    await c.run('lang EN');
    expect(c.navigations).toEqual(['/en/projects/x/']);
  });

  it('lang explains its usage and rejects unknown languages', async () => {
    const c = fakeConsole('es');
    await c.run('lang');
    expect(c.text()).toContain('uso: lang es|en');
    await c.run('lang fr');
    expect(c.text()).toContain('idioma desconocido: fr');
    await c.run('lang es');
    expect(c.text()).toContain('ya estás en español');
    expect(c.navigations).toEqual([]);
  });

  it('cv points to contact while the PDF is missing', async () => {
    const c = fakeConsole('en');
    await c.run('cv');
    expect(c.text()).toContain('data-cmd="contact"');
    expect(c.downloads).toEqual([]);
  });

  it('cv downloads the PDF when it exists', async () => {
    const data: ConsoleData = {
      ...sampleData.es,
      cv: { url: '/es/cv.pdf', filename: 'cv.pdf' },
    };
    const c = fakeConsole('es', { data });
    await c.run('cv');
    expect(c.downloads).toEqual(['/es/cv.pdf']);
    expect(c.text()).toContain('href="/es/cv.pdf"');
  });

  it('contacto and contact both work in any language', async () => {
    for (const name of ['contacto', 'contact']) {
      const c = fakeConsole('es');
      await c.run(name);
      expect(c.text()).toContain(`mailto:${sampleData.es.contact.email}`);
    }
  });

  it('anything else goes to the fallback (AI not configured)', async () => {
    const c = fakeConsole('es');
    const result = await c.run('¿Ha trabajado con IA?');
    expect(result?.command).toBeUndefined();
    expect(c.text()).toContain('La IA todavía no está disponible');
  });

  it('empty input does nothing', async () => {
    const c = fakeConsole();
    expect(await c.run('   ')).toBeUndefined();
    expect(c.output).toEqual([]);
  });
});

describe('complete', () => {
  it('completes a unique command name with a trailing space', () => {
    const { registry, ctx } = fakeConsole('es');
    expect(complete('la', registry, ctx)).toEqual({
      value: 'lang ',
      candidates: ['lang'],
    });
    expect(complete('  WH', registry, ctx).value).toBe('  whoami ');
  });

  it('uses the localized names', () => {
    const en = fakeConsole('en');
    expect(complete('cont', en.registry, en.ctx).value).toBe('contact ');
    const es = fakeConsole('es');
    expect(complete('cont', es.registry, es.ctx).value).toBe('contacto ');
  });

  it('lists candidates when several match', () => {
    const { registry, ctx } = fakeConsole('es');
    const result = complete('c', registry, ctx);
    expect(result.value).toBe('c');
    expect(result.candidates).toEqual(['cat', 'cv', 'contacto', 'clear']);
  });

  it('completes arguments through the command hook', () => {
    const { registry, ctx } = fakeConsole('es');
    expect(complete('lang ', registry, ctx).candidates).toEqual(['es', 'en']);
    expect(complete('lang e', registry, ctx)).toEqual({
      value: 'lang e',
      candidates: ['es', 'en'],
    });
    expect(complete('lang en', registry, ctx).value).toBe('lang en ');
    expect(complete('lang en x', registry, ctx).candidates).toEqual([]);
  });

  it('leaves the input alone when nothing matches', () => {
    const { registry, ctx } = fakeConsole('es');
    expect(complete('zzz', registry, ctx)).toEqual({
      value: 'zzz',
      candidates: [],
    });
    expect(complete('', registry, ctx).value).toBe('');
    expect(complete('whoami x', registry, ctx).candidates).toEqual([]);
  });
});

describe('boot', () => {
  it('renders whoami and map as static HTML with a single h1', async () => {
    const markup = (
      await renderBoot({
        registry: createRegistry(),
        locale: 'es',
        data: sampleData.es,
        pathname: '/es/',
      })
    ).value;
    expect(markup).toContain('<h1 class="c-hero-name">');
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain('data-output-of="whoami"');
    expect(markup).toContain('data-output-of="map"');
    expect(markup).toContain('visitante@portfolio:~$');
    expect(markup.match(/data-boot="echo"/g)).toHaveLength(2);
  });
});

describe('quickCommands', () => {
  it('shows registered commands in order, with the sample question', () => {
    const labels = quickCommands(createRegistry(), 'en').map((q) => q.label);
    expect(labels).toEqual([
      'map',
      'ls',
      'cv',
      'contact',
      'analyze-job',
      'AI experience?',
      'help',
    ]);
  });
});

describe('S11: company link and offer analyzer', () => {
  it('analiza-oferta prints a text area, in both languages', async () => {
    const es = fakeConsole('es');
    await es.run('analiza-oferta');
    expect(es.text()).toContain('<textarea class="c-offer-text"');
    expect(es.text()).not.toContain('maxlength');
    expect(es.text()).toContain('0 / 8000');
    expect(es.text()).toContain('Pega la descripción de una oferta');
    const en = fakeConsole('en');
    await en.run('analyze-job');
    expect(en.text()).toContain('Job description');
    expect(en.text()).toContain('0 / 8,000');
    expect(en.registry.completionNames('en')).toContain('analyze-job');
    expect(en.registry.completionNames('es')).toContain('analiza-oferta');
  });

  it('mentions the company, escaped, when the visit has one', async () => {
    const c = fakeConsole('en', { company: 'Procter & Gamble' });
    await c.run('analyze-job');
    expect(c.text()).toContain(
      'Paste Procter &amp; Gamble&#39;s job description',
    );
  });

  it('adds the future node to a typed map only with a company', async () => {
    const first = sampleData.es.profile.name.split(' ')[0] ?? '';
    const plain = fakeConsole('es');
    await plain.run('map');
    expect(plain.text()).not.toContain('data-company-node');
    const amazon = fakeConsole('es', { company: 'Amazon' });
    await amazon.run('map');
    expect(amazon.text()).toContain('>¿Amazon?</text>');
    expect(amazon.text()).toContain(
      `data-cmd="¿Por qué debería contratar Amazon a ${first}?"`,
    );
    const en = fakeConsole('en', { company: 'Amazon' });
    await en.run('map');
    expect(en.text()).toContain('>Amazon?</text>');
    expect(en.text()).toContain('data-cmd="Why should Amazon hire ');
  });
});
