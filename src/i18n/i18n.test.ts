import { describe, expect, it } from 'vitest';
import {
  itemIdFromPath,
  itemPath,
  localeFromPath,
  localeHome,
  sectionPath,
  switchLocalePath,
} from './paths';
import { pick, ui } from './ui';

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) =>
      leaves(v, path ? `${path}.${key}` : key),
    );
  }
  return [[path, value]];
}

describe('ui strings', () => {
  it('has the same keys in both languages and no empty strings', () => {
    const es = leaves(ui.es);
    const en = leaves(ui.en);
    expect(en.map(([k]) => k)).toEqual(es.map(([k]) => k));
    for (const [key, value] of [...es, ...en]) {
      expect(typeof value, key).toBe('string');
      expect(value, key).not.toBe('');
    }
  });

  it('picks one value per language', () => {
    expect(pick((t) => t.console.prompt)).toEqual({
      es: 'visitante@portfolio:~$',
      en: 'visitor@portfolio:~$',
    });
  });
});

describe('locale paths', () => {
  it('switches the language prefix and keeps the rest', () => {
    expect(switchLocalePath('/es/', 'en')).toBe('/en/');
    expect(switchLocalePath('/en/proyectos/app', 'es')).toBe(
      '/es/proyectos/app',
    );
    expect(switchLocalePath('/', 'en')).toBe('/en/');
    expect(switchLocalePath('/other', 'es')).toBe('/es/other');
  });

  it('reads the language from a path', () => {
    expect(localeFromPath('/en/x')).toBe('en');
    expect(localeFromPath('/fr/')).toBeUndefined();
    expect(localeHome('es')).toBe('/es/');
  });
});

describe('section paths', () => {
  it('translates section segments when switching language', () => {
    expect(switchLocalePath('/es/proyectos/my-app/', 'en')).toBe(
      '/en/projects/my-app/',
    );
    expect(switchLocalePath('/en/reading/', 'es')).toBe('/es/lectura/');
    expect(switchLocalePath('/en/privacy/', 'es')).toBe('/es/privacidad/');
  });

  it('builds item and section paths', () => {
    expect(itemPath('x', 'es')).toBe('/es/proyectos/x/');
    expect(itemPath('x', 'en')).toBe('/en/projects/x/');
    expect(sectionPath('reading', 'en')).toBe('/en/reading/');
  });

  it('reads the item id of an item page only', () => {
    expect(itemIdFromPath('/es/proyectos/my-app/')).toBe('my-app');
    expect(itemIdFromPath('/en/projects/my-app')).toBe('my-app');
    expect(itemIdFromPath('/en/proyectos/my-app/')).toBeUndefined();
    expect(itemIdFromPath('/es/proyectos/')).toBeUndefined();
    expect(itemIdFromPath('/es/proyectos/a/b')).toBeUndefined();
    expect(itemIdFromPath('/es/')).toBeUndefined();
  });
});
