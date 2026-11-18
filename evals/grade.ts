/**
 * Deterministic grading for the AI eval (criteria in docs/specs/09-ai-backend.md).
 * Pure functions, unit tested in grade.test.ts.
 */
import type { SourceRef } from '../src/server/ai/context';
import { extractSources } from '../src/server/ai/prompt';
import type { ChatTurn } from '../src/server/ai/validation';

export type QuestionType =
  'aggregate' | 'detail' | 'negative' | 'english' | 'offtopic' | 'multiturn';

export interface EvalQuestion {
  id: string;
  type: QuestionType;
  locale: 'es' | 'en';
  question?: string;
  messages?: ChatTurn[];
  expectSources?: string[];
  forbidSources?: string[];
  mustMention?: string[];
  mustNotMention?: string[];
  expectDecline?: boolean;
}

export interface Grade {
  /** Cited ids that exist in the content. */
  cited: string[];
  /** Ids in `[...]` that do not exist (hallucinated citations). */
  unknownCitations: string[];
  sourcePrecision: number | null;
  sourceRecall: number | null;
  mentionsOk: boolean;
  forbiddenOk: boolean;
  declineOk: boolean | null;
  languageOk: boolean | null;
  pass: boolean;
}

export const turnsOf = (q: EvalQuestion): ChatTurn[] =>
  q.messages ?? [{ role: 'user', content: q.question ?? '' }];

/** Lowercase, no accents: "Migración" -> "migracion". */
export const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const DECLINE_PATTERNS = [
  'no aparece',
  'no menciona',
  'no se menciona',
  'no hay informacion',
  'no tengo informacion',
  'no dispongo',
  'no figura',
  'no consta',
  'no puedo',
  'solo puedo',
  'fuera de',
  'not mention',
  "doesn't mention",
  'does not mention',
  'not mentioned',
  'no information',
  "don't have information",
  'do not have information',
  'not in the portfolio',
  "can't help",
  'cannot help',
  'can only',
  'only answer',
  'only talk',
  'outside',
  'not able to',
];

export function looksLikeDecline(answer: string): boolean {
  const text = normalize(answer);
  return DECLINE_PATTERNS.some((pattern) => text.includes(pattern));
}

const EN_WORDS = ['the', 'and', 'he', 'his', 'with', 'is', 'of', 'in', 'has'];
const ES_WORDS = ['el', 'la', 'y', 'con', 'de', 'en', 'que', 'ha', 'su', 'los'];

export function detectLanguage(text: string): 'es' | 'en' {
  const words = normalize(text).split(/[^a-z]+/);
  const count = (list: string[]) =>
    words.filter((w) => list.includes(w)).length;
  return count(EN_WORDS) > count(ES_WORDS) ? 'en' : 'es';
}

const CITATION = /\[([a-z0-9][a-z0-9-]*(?:\s*,\s*[a-z0-9][a-z0-9-]*)*)\]/g;

function citedIds(answer: string): string[] {
  const ids = new Set<string>();
  for (const match of answer.matchAll(CITATION)) {
    for (const id of (match[1] ?? '').split(',')) ids.add(id.trim());
  }
  return [...ids];
}

/** Language the answer should be in: the question's, else the site's. */
function expectedLanguage(q: EvalQuestion): 'es' | 'en' | null {
  if (q.type === 'english') return 'en';
  if (q.type === 'aggregate' || q.type === 'detail') return q.locale;
  return null;
}

export function grade(
  q: EvalQuestion,
  answer: string,
  known: SourceRef[],
): Grade {
  const cited = extractSources(answer, known).map((s) => s.id);
  const knownIds = new Set(known.map((s) => s.id));
  const unknownCitations = citedIds(answer).filter((id) => !knownIds.has(id));
  const text = normalize(answer);

  const expected = q.expectSources ?? [];
  const sourcePrecision =
    expected.length && cited.length
      ? cited.filter((id) => expected.includes(id)).length / cited.length
      : expected.length
        ? 0
        : null;
  const sourceRecall = expected.length
    ? expected.filter((id) => cited.includes(id)).length / expected.length
    : null;

  const mentionsOk = (q.mustMention ?? []).every((entry) =>
    entry.split('|').some((alt) => text.includes(normalize(alt))),
  );
  const forbiddenOk =
    !(q.mustNotMention ?? []).some((entry) =>
      text.includes(normalize(entry)),
    ) && !(q.forbidSources ?? []).some((id) => cited.includes(id));

  const declineOk = q.expectDecline
    ? looksLikeDecline(answer) &&
      (q.type === 'offtopic' ? cited.length === 0 : true)
    : null;

  const lang = expectedLanguage(q);
  const languageOk = lang ? detectLanguage(answer) === lang : null;

  const pass =
    unknownCitations.length === 0 &&
    mentionsOk &&
    forbiddenOk &&
    declineOk !== false &&
    languageOk !== false &&
    (sourceRecall === null || sourceRecall >= 0.5) &&
    (sourcePrecision === null || sourcePrecision >= 0.5);

  return {
    cited,
    unknownCitations,
    sourcePrecision,
    sourceRecall,
    mentionsOk,
    forbiddenOk,
    declineOk,
    languageOk,
    pass,
  };
}
