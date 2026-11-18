import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAiContext,
  readContentSnapshot,
} from '../src/server/ai/context-builder';
import {
  detectLanguage,
  grade,
  looksLikeDecline,
  normalize,
  turnsOf,
  type EvalQuestion,
} from './grade';

const { questions } = JSON.parse(
  readFileSync('evals/questions.json', 'utf8'),
) as { questions: EvalQuestion[] };

const known = [
  { id: 'demo-a', kind: 'item' as const, title: 'A' },
  { id: 'demo-b', kind: 'item' as const, title: 'B' },
];

describe('eval questions', () => {
  it('has 30–40 questions with unique ids and every type', () => {
    expect(questions.length).toBeGreaterThanOrEqual(30);
    expect(questions.length).toBeLessThanOrEqual(40);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.type))).toEqual(
      new Set([
        'aggregate',
        'detail',
        'negative',
        'english',
        'offtopic',
        'multiturn',
      ]),
    );
  });

  it('only expects sources that exist in the fixture context', () => {
    // Skipped automatically once src/content/fixtures is deleted.
    const ids = new Set(
      buildAiContext(readContentSnapshot('src/content'), {
        fixturesOnly: true,
      }).locales.es.sources.map((s) => s.id),
    );
    if (ids.size === 0) return;
    for (const q of questions) {
      for (const id of [
        ...(q.expectSources ?? []),
        ...(q.forbidSources ?? []),
      ]) {
        expect(ids, `${q.id} -> ${id}`).toContain(id);
      }
    }
  });

  it('every question ends with a user turn', () => {
    for (const q of questions) {
      const turns = turnsOf(q);
      expect(turns.at(-1)?.role, q.id).toBe('user');
      expect(turns.at(-1)?.content.length, q.id).toBeGreaterThan(0);
    }
  });
});

describe('grading', () => {
  const detail: EvalQuestion = {
    id: 'd',
    type: 'detail',
    locale: 'es',
    question: '?',
    expectSources: ['demo-a'],
    mustMention: ['migración|migrar', '2021'],
  };

  it('passes a grounded answer with the right citation', () => {
    const g = grade(
      detail,
      'Hizo una migracion en 2021 con el equipo [demo-a].',
      known,
    );
    expect(g).toMatchObject({
      cited: ['demo-a'],
      sourcePrecision: 1,
      sourceRecall: 1,
      mentionsOk: true,
      languageOk: true,
      pass: true,
    });
  });

  it('fails hallucinated citations, missing facts and wrong sources', () => {
    expect(grade(detail, 'En 2021 migró la app [demo-zzz].', known).pass).toBe(
      false,
    );
    expect(
      grade(detail, 'Hizo una migración [demo-a].', known).mentionsOk,
    ).toBe(false);
    expect(grade(detail, 'Migración en 2021 [demo-b].', known).pass).toBe(
      false,
    );
  });

  it('checks declines, and off-topic declines must not cite', () => {
    const offtopic: EvalQuestion = {
      id: 'o',
      type: 'offtopic',
      locale: 'es',
      question: '?',
      expectDecline: true,
    };
    expect(
      grade(offtopic, 'Solo puedo hablar de su experiencia profesional.', known)
        .pass,
    ).toBe(true);
    expect(grade(offtopic, 'Claro, aquí tienes la función.', known).pass).toBe(
      false,
    );
    expect(
      grade(offtopic, 'Solo puedo hablar de su experiencia [demo-a].', known)
        .pass,
    ).toBe(false);
  });

  it('helpers: accents, declines and language', () => {
    expect(normalize('Migración ÁÉ')).toBe('migracion ae');
    expect(looksLikeDecline('The portfolio does not mention Rust.')).toBe(true);
    expect(looksLikeDecline('Sí, con Kotlin.')).toBe(false);
    expect(detectLanguage('He worked on the banking app with his team.')).toBe(
      'en',
    );
    expect(detectLanguage('Trabajó en la app de banca con el equipo.')).toBe(
      'es',
    );
  });
});
