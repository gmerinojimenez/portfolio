/**
 * Deterministic grading for the AI eval (criteria in docs/specs/09-ai-backend.md).
 * Pure functions, unit tested in grade.test.ts.
 */
import type { SourceRef } from '../src/server/ai/context';
import { parseAnalysis, type OfferAnalysis } from '../src/server/ai/offer';
import { extractSources } from '../src/server/ai/prompt';
import type { ChatTurn } from '../src/server/ai/validation';

export type QuestionType =
  | 'aggregate'
  | 'detail'
  | 'negative'
  | 'english'
  | 'offtopic'
  | 'multiturn'
  /** In scope, but easy for the scope gate (S17) to get wrong. */
  | 'borderline';

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
  /**
   * Off-topic declines must not cite by default. Set this when a partial
   * answer is fine (decline the opinion, still state the facts with sources).
   */
  declineMayCite?: boolean;
  /** At least this many real citations (when no exact ids are expected). */
  minCited?: number;
  /** At most this many words (e.g. "a short summary"). */
  maxWords?: number;
  /**
   * Expected scope gate verdict (S17). Default: `reject` for offtopic,
   * `pass` for everything else. `any` when either is fine.
   */
  gate?: 'pass' | 'reject' | 'any';
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
  /** `null` when the question sets no `minCited` / `maxWords`. */
  citedOk: boolean | null;
  lengthOk: boolean | null;
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

/**
 * Phrases (normalized: no accents, straight apostrophes, lowercase) that show
 * the model declined or said the content does not cover the question. We
 * detect them instead of asking the model for a marker: a marker would have
 * to be stripped from the stream and hidden by the client (S10), and would
 * leak into answers; the eval is its only consumer, so the cost belongs here.
 */
const DECLINE_PATTERNS = [
  // Spanish: "not in the content"
  'no aparece',
  'no menciona',
  'no lo menciona',
  'no la menciona',
  'no se menciona',
  'no incluye',
  'no indica',
  'no dice',
  'no describe',
  'no recoge',
  'no hay informacion',
  'no hay ningun',
  'no tengo informacion',
  'no dispongo',
  'no figura',
  'no consta',
  'no contiene',
  'no especifica',
  // Spanish: refusing
  'no puedo',
  'no voy a',
  'no es posible',
  'prefiero no',
  'no ofrezco',
  'no opino',
  'lo siento',
  'solo puedo',
  'fuera de',
  'no esta relacionad',
  'queda fuera',
  // English: "not in the content"
  'not mention',
  "doesn't mention",
  'does not mention',
  'not mentioned',
  "doesn't say",
  'does not say',
  "doesn't include",
  'does not include',
  "doesn't list",
  'does not list',
  "doesn't describe",
  'does not describe',
  "doesn't cover",
  'does not cover',
  'no information',
  "don't have information",
  'do not have information',
  'not in the portfolio',
  'not listed',
  // English: refusing
  "can't",
  'cannot',
  'can not',
  "won't",
  'not able to',
  'unable to',
  "i'm sorry",
  'sorry,',
  'can only',
  'only answer',
  'only talk',
  'only discuss',
  'outside',
];

export function looksLikeDecline(answer: string): boolean {
  const text = normalize(answer).replace(/[\u2018\u2019]/g, "'");
  return DECLINE_PATTERNS.some((pattern) => text.includes(pattern));
}

const EN_WORDS = [
  'the',
  'and',
  'he',
  'his',
  'with',
  'is',
  'of',
  'in',
  'has',
  'was',
  'for',
  'to',
  'it',
  'does',
  'that',
  'as',
  'on',
  'what',
  'how',
  'who',
  'you',
  'are',
];
const ES_WORDS = [
  'el',
  'la',
  'y',
  'con',
  'de',
  'en',
  'que',
  'ha',
  'su',
  'los',
  'las',
  'un',
  'una',
  'es',
  'por',
  'para',
  'se',
  'del',
  'al',
  'lo',
  'como',
  'qué',
  'cuál',
];

/** `null` when there is no signal (or a tie): short or name-only text. */
export function guessLanguage(text: string): 'es' | 'en' | null {
  const words = normalize(text).split(/[^a-z]+/);
  const count = (list: string[]) =>
    words.filter((w) => list.map(normalize).includes(w)).length;
  const en = count(EN_WORDS);
  const es = count(ES_WORDS);
  if (en === es) return null;
  return en > es ? 'en' : 'es';
}

export function detectLanguage(text: string): 'es' | 'en' {
  return guessLanguage(text) ?? 'es';
}

/** The answer with every known source title removed (normalized text). */
export function withoutTitles(answer: string, known: SourceRef[]): string {
  let text = normalize(answer);
  for (const { title } of known) {
    const t = normalize(title).trim();
    if (t.length > 0) text = text.split(t).join(' ');
  }
  return text;
}

const CITATION = /\[([a-z0-9][a-z0-9-]*(?:\s*,\s*[a-z0-9][a-z0-9-]*)*)\]/g;

function citedIds(answer: string): string[] {
  const ids = new Set<string>();
  for (const match of answer.matchAll(CITATION)) {
    for (const id of (match[1] ?? '').split(',')) ids.add(id.trim());
  }
  return [...ids];
}

/**
 * Language the answer should be in: the visitor's last question, or the
 * site's locale when the question is ambiguous (the rule in the prompt).
 */
export function expectedLanguage(q: EvalQuestion): 'es' | 'en' {
  const last = turnsOf(q).at(-1)?.content ?? '';
  return guessLanguage(last) ?? q.locale;
}

/**
 * Source rules. Recall (did it cite what the question needs) is required for
 * every question. Precision is only required where the answer should rest on
 * one item (detail, multiturn): aggregate and English questions legitimately
 * cite several related items, so extra citations there are reported in
 * `sourcePrecision` but do not fail. Wrong sources are still caught by
 * hallucinated ids (`unknownCitations`) and by `forbidSources`.
 */
const PRECISION_TYPES: QuestionType[] = ['detail', 'multiturn'];

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
      (q.type === 'offtopic' && !q.declineMayCite ? cited.length === 0 : true)
    : null;

  // No signal in the answer (very short) is not a failure. Source titles are
  // proper names kept as written (often English in a Spanish answer), so they
  // are left out of the guess.
  const answerLang = guessLanguage(withoutTitles(answer, known));
  const languageOk = answerLang === null || answerLang === expectedLanguage(q);

  const citedOk = q.minCited === undefined ? null : cited.length >= q.minCited;
  const words = answer.replace(CITATION, ' ').split(/\s+/).filter(Boolean);
  const lengthOk = q.maxWords === undefined ? null : words.length <= q.maxWords;

  const pass =
    citedOk !== false &&
    lengthOk !== false &&
    unknownCitations.length === 0 &&
    mentionsOk &&
    forbiddenOk &&
    declineOk !== false &&
    languageOk !== false &&
    (sourceRecall === null || sourceRecall >= 0.5) &&
    (sourcePrecision === null ||
      !PRECISION_TYPES.includes(q.type) ||
      sourcePrecision >= 0.5);

  return {
    cited,
    unknownCitations,
    sourcePrecision,
    sourceRecall,
    mentionsOk,
    forbiddenOk,
    declineOk,
    languageOk,
    citedOk,
    lengthOk,
    pass,
  };
}

// ---------------------------------------------------------------- offers

/** A sample job offer for the analyzer (S11), with what a good answer has. */
export interface EvalOffer {
  id: string;
  locale: 'es' | 'en';
  company?: string;
  offer: string;
  /** At least this many matches (a good fit), or at most (a bad one). */
  minMatches?: number;
  maxMatches?: number;
  minGaps?: number;
  /** Ids that at least one match should cite (recall >= 0.5). */
  expectSources?: string[];
  /** Each entry must appear in some gap (`a|b` = alternatives). */
  expectGaps?: string[];
  /** Words that must not appear in any match's requirement or evidence. */
  forbidInMatches?: string[];
  /**
   * Words that must not appear in any gap: skills the portfolio shows, or
   * alternatives he doesn't need ("Android and/or iOS").
   */
  forbidInGaps?: string[];
  /** Words that must not appear anywhere in the analysis. */
  mustNotMention?: string[];
}

export interface OfferGrade {
  /** The raw answer parsed and followed the schema. */
  schemaOk: boolean;
  /** Ids in `sources` that aren't real (the schema should prevent any). */
  unknownSources: string[];
  cited: string[];
  sourceRecall: number | null;
  countsOk: boolean;
  gapsOk: boolean;
  /** No match claims experience the offer's forbidden words describe. */
  noInventedOk: boolean;
  /** No gap names something the portfolio shows or he doesn't need. */
  noFalseGapsOk: boolean;
  forbiddenOk: boolean;
  languageOk: boolean | null;
  pass: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Strict check of the raw JSON against the schema in offer.ts. */
export function followsOfferSchema(raw: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  const keys = (o: Record<string, unknown>, expected: string[]) =>
    Object.keys(o).sort().join() === [...expected].sort().join();
  const str = (v: unknown) => typeof v === 'string';
  if (!isObject(data)) return false;
  if (!keys(data, ['summary', 'matches', 'gaps', 'questions'])) return false;
  const { summary, matches, gaps, questions } = data;
  return (
    str(summary) &&
    Array.isArray(matches) &&
    matches.every(
      (m) =>
        isObject(m) &&
        keys(m, ['requirement', 'evidence', 'sources']) &&
        str(m['requirement']) &&
        str(m['evidence']) &&
        Array.isArray(m['sources']) &&
        m['sources'].every(str),
    ) &&
    Array.isArray(gaps) &&
    gaps.every(
      (g) =>
        isObject(g) &&
        keys(g, ['requirement', 'detail']) &&
        str(g['requirement']) &&
        str(g['detail']),
    ) &&
    Array.isArray(questions) &&
    questions.every(str)
  );
}

function rawSources(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as { matches?: { sources?: unknown }[] };
    return (data.matches ?? []).flatMap((m) =>
      Array.isArray(m.sources)
        ? m.sources.filter((id): id is string => typeof id === 'string')
        : [],
    );
  } catch {
    return [];
  }
}

const has = (text: string, entry: string) =>
  entry.split('|').some((alt) => normalize(text).includes(normalize(alt)));

export function gradeOffer(
  o: EvalOffer,
  raw: string,
  known: SourceRef[],
): OfferGrade {
  const knownIds = new Set(known.map((s) => s.id));
  const unknownSources = [
    ...new Set(rawSources(raw).filter((id) => !knownIds.has(id))),
  ];
  const analysis: OfferAnalysis | undefined = parseAnalysis(raw, known);
  const schemaOk = followsOfferSchema(raw) && analysis !== undefined;
  const a = analysis ?? { summary: '', matches: [], gaps: [], questions: [] };

  const cited = [...new Set(a.matches.flatMap((m) => m.sources))];
  const expected = o.expectSources ?? [];
  const sourceRecall = expected.length
    ? expected.filter((id) => cited.includes(id)).length / expected.length
    : null;
  const countsOk =
    a.matches.length >= (o.minMatches ?? 0) &&
    a.matches.length <= (o.maxMatches ?? Number.POSITIVE_INFINITY) &&
    a.gaps.length >= (o.minGaps ?? 0);
  const gapText = a.gaps
    .map((g) => `${g.requirement} ${g.detail}`)
    .join(' \n ');
  const gapsOk = (o.expectGaps ?? []).every((entry) => has(gapText, entry));
  // Only the requirement: the evidence may legitimately say "no SwiftUI".
  const noInventedOk = !a.matches.some((m) =>
    (o.forbidInMatches ?? []).some((word) => has(m.requirement, word)),
  );
  const noFalseGapsOk = !(o.forbidInGaps ?? []).some((word) =>
    has(gapText, word),
  );
  const all = [
    a.summary,
    ...a.matches.flatMap((m) => [m.requirement, m.evidence]),
    ...a.gaps.flatMap((g) => [g.requirement, g.detail]),
    ...a.questions,
  ].join(' \n ');
  const forbiddenOk = !(o.mustNotMention ?? []).some((w) => has(all, w));
  const lang = guessLanguage(withoutTitles(`${a.summary} ${gapText}`, known));
  const languageOk = lang === null ? null : lang === o.locale;

  const pass =
    schemaOk &&
    unknownSources.length === 0 &&
    countsOk &&
    gapsOk &&
    noInventedOk &&
    noFalseGapsOk &&
    forbiddenOk &&
    languageOk !== false &&
    (sourceRecall === null || sourceRecall >= 0.5);
  return {
    schemaOk,
    unknownSources,
    cited,
    sourceRecall,
    countsOk,
    gapsOk,
    noInventedOk,
    noFalseGapsOk,
    forbiddenOk,
    languageOk,
    pass,
  };
}
