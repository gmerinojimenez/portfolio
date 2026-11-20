import { describe, expect, it } from 'vitest';
import { readTrack, sanitizeTrack, withTrack } from './track';

describe('track', () => {
  it('accepts only the known tracks', () => {
    expect(sanitizeTrack('ai')).toBe('ai');
    expect(sanitizeTrack(' Android ')).toBe('android');
    expect(sanitizeTrack('general')).toBeUndefined();
    expect(sanitizeTrack('ai<script>')).toBeUndefined();
    expect(sanitizeTrack(null)).toBeUndefined();
  });

  it('reads it from a query string next to other parameters', () => {
    expect(readTrack('?company=Amazon&track=ai')).toBe('ai');
    expect(readTrack('?track=foo')).toBeUndefined();
    expect(readTrack('')).toBeUndefined();
  });

  it('keeps other parameters when adding it to a path', () => {
    expect(withTrack('/en/?company=Amazon', 'ai')).toBe(
      '/en/?company=Amazon&track=ai',
    );
    expect(withTrack('/en/', undefined)).toBe('/en/');
  });
});
