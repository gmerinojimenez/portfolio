import { describe, expect, it } from 'vitest';
import {
  companyProperty,
  readCompany,
  sanitizeCompany,
  withCompany,
} from './company';

describe('sanitizeCompany', () => {
  it('accepts real company names', () => {
    for (const name of [
      'Amazon',
      'Procter & Gamble',
      'Zalando SE',
      'Mercado Libre',
      "McDonald's",
      'Telefónica',
      'Société Générale',
      'S.A. Ñandú, Inc.',
      'Ozon-3',
      'メルカリ',
    ]) {
      expect(sanitizeCompany(name)).toBe(name);
    }
  });

  it('trims and collapses spaces', () => {
    expect(sanitizeCompany('  Mercado    Libre ')).toBe('Mercado Libre');
  });

  it('rejects HTML, URLs and other symbols', () => {
    for (const value of [
      '<script>alert(1)</script>',
      '<b>Amazon</b>',
      'Amazon"',
      'https://evil.example',
      'evil.com',
      'www.amazon',
      'Amazon/jobs',
      'a@b',
      'Amazon?',
      'Amazon\nInc',
      'Amazon‮',
    ]) {
      expect(sanitizeCompany(value)).toBeUndefined();
    }
  });

  it('rejects empty values and values with no letter or digit', () => {
    expect(sanitizeCompany('')).toBeUndefined();
    expect(sanitizeCompany('   ')).toBeUndefined();
    expect(sanitizeCompany('...')).toBeUndefined();
    expect(sanitizeCompany("&-'")).toBeUndefined();
    expect(sanitizeCompany(null)).toBeUndefined();
    expect(sanitizeCompany(undefined)).toBeUndefined();
  });

  it('accepts 30 characters and rejects 31', () => {
    expect(sanitizeCompany('a'.repeat(30))).toBe('a'.repeat(30));
    expect(sanitizeCompany('a'.repeat(31))).toBeUndefined();
    // Length is measured after trimming.
    expect(sanitizeCompany(` ${'a'.repeat(30)} `)).toBe('a'.repeat(30));
  });
});

describe('readCompany', () => {
  it('reads and validates the query parameter', () => {
    expect(readCompany('?company=Amazon')).toBe('Amazon');
    expect(readCompany('?ref=x&company=Procter%20%26%20Gamble')).toBe(
      'Procter & Gamble',
    );
    expect(readCompany('?company=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).toBe(
      undefined,
    );
    expect(readCompany('')).toBeUndefined();
  });
});

describe('withCompany', () => {
  it('adds the company to a path, keeping the rest', () => {
    expect(withCompany('/en/', 'Procter & Gamble')).toBe(
      '/en/?company=Procter+%26+Gamble',
    );
    expect(withCompany('/en/?x=1#top', 'Amazon')).toBe(
      '/en/?x=1&company=Amazon#top',
    );
    expect(withCompany('/en/', undefined)).toBe('/en/');
    expect(readCompany(withCompany('/en/', 'Zalando SE').slice(4))).toBe(
      'Zalando SE',
    );
  });

  it('lowercases the analytics property', () => {
    expect(companyProperty('Zalando SE')).toBe('zalando se');
  });
});
