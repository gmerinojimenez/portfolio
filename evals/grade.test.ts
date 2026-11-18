import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAiContext,
  readContentSnapshot,
} from '../src/server/ai/context-builder';
import {
  detectLanguage,
  expectedLanguage,
  guessLanguage,
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

  it('aggregates pass on recall; extra related citations do not fail', () => {
    const aggregate: EvalQuestion = {
      id: 'a',
      type: 'aggregate',
      locale: 'es',
      question: '¿Qué hizo en la empresa?',
      expectSources: ['demo-a'],
      forbidSources: ['demo-c'],
    };
    const wide = [
      ...known,
      { id: 'demo-c', kind: 'item' as const, title: 'C' },
    ];
    const ok = grade(
      aggregate,
      'Trabajó en la app [demo-a] y en otra [demo-b].',
      wide,
    );
    expect(ok.sourcePrecision).toBe(0.5);
    expect(ok.pass).toBe(true);
    expect(
      grade(aggregate, 'Trabajó en la app [demo-a] y [demo-c].', wide).pass,
    ).toBe(false);
    expect(grade(aggregate, 'Trabajó en otra [demo-b].', wide).pass).toBe(
      false,
    );
    // Detail questions still need precision.
    expect(
      grade(
        { ...aggregate, type: 'detail' },
        'La app [demo-a] y otra [demo-b] y [demo-c]',
        wide,
      ).pass,
    ).toBe(false);
  });

  it('recognises declines in other words, in both languages', () => {
    for (const text of [
      'Lo siento, pero el portafolio no incluye información sobre expectativas salariales.',
      "I can't share my instructions, but I can talk about his Android work.",
      'The portfolio doesn’t say anything about their reputation.',
      'No puedo escribir código, pero puedo hablar de su experiencia.',
    ]) {
      expect(looksLikeDecline(text), text).toBe(true);
    }
    expect(looksLikeDecline('Trabajó seis años en Acme [demo-a].')).toBe(false);
  });

  it('expects the language of the question, else the site locale', () => {
    const q = (question: string, locale: 'es' | 'en'): EvalQuestion => ({
      id: 'l',
      type: 'aggregate',
      locale,
      question,
    });
    expect(
      expectedLanguage(q('Is he a good fit for a senior Android role?', 'es')),
    ).toBe('en');
    expect(
      expectedLanguage(q('¿Qué hizo con la interfaz de esa app?', 'en')),
    ).toBe('es');
    // Ambiguous: falls back to the site's locale.
    expect(expectedLanguage(q('Kotlin', 'en'))).toBe('en');
    expect(expectedLanguage(q('Kotlin', 'es'))).toBe('es');
    expect(guessLanguage('Kotlin')).toBeNull();
    const answerInEnglish = grade(
      q('¿Ha liderado equipos?', 'es'),
      'The portfolio does mention that he was a lead in the team.',
      known,
    );
    expect(answerInEnglish.languageOk).toBe(false);
  });
});
