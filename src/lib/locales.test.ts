import { describe, expect, it } from 'vitest';
import { defaultLocale, isLocale } from './locales';

describe('locales', () => {
  it('defaults to Spanish', () => {
    expect(defaultLocale).toBe('es');
  });

  it('accepts only es and en', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});
