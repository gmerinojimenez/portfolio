/**
 * Scope gate (S17, ADR 0015): a cheap classifier that runs before Claude in
 * chat mode, so questions clearly outside the portfolio's scope ("how do I
 * make flan?") never pay for the full content in the context.
 *
 * Quality first: only a clear "no" is rejected (`inScope < REJECT_BELOW`).
 * Doubtful questions go on to Claude, which still declines off-topic ones by
 * itself. A gate failure never blocks a question (fail open).
 *
 * This module is provider-agnostic and pure: the verdict rule, the state the
 * classifier sees and its instructions. jev-scope-gate.ts calls Jev with them.
 */
import type { Locale } from '../../lib/locales';
import type { ChatTurn } from './validation';

/** `off`: no gate. `shadow`: score and log, never block. `enforce`: block. */
export type ScopeGateMode = 'off' | 'shadow' | 'enforce';

export const SCOPE_GATE_MODES: readonly ScopeGateMode[] = [
  'off',
  'shadow',
  'enforce',
];

/** Reject only when the probability of being in scope is below this. */
export const REJECT_BELOW = 0.3;

/** Turns of history the gate sees, including the latest question. */
export const GATE_HISTORY_TURNS = 4;
/** Earlier answers are cut: the gate only needs what they were about. */
export const GATE_ANSWER_CHARS = 400;

export interface ScopeGateInput {
  locale: Locale;
  /** The validated conversation; the last turn is the visitor's question. */
  messages: ChatTurn[];
  /** Companies and item titles in the portfolio (LocaleContext.topics). */
  topics?: string[];
}

interface GateMeta {
  model: string;
  /** Billable input tokens (0 when the call failed before billing). */
  inputTokens: number;
  latencyMs: number;
}

export type ScopeGateResult =
  | (GateMeta & {
      verdict: 'pass' | 'reject';
      /** Probability (0–1) that the latest question is in scope. */
      inScope: number;
      /** Language of the latest question, when the classifier is sure. */
      language?: Locale;
    })
  | (GateMeta & { verdict: 'error'; reason: string });

export interface ScopeGate {
  readonly model: string;
  /** Never throws: failures come back as `verdict: 'error'`. */
  check(input: ScopeGateInput): Promise<ScopeGateResult>;
}

export const verdictFor = (inScope: number): 'pass' | 'reject' =>
  inScope < REJECT_BELOW ? 'reject' : 'pass';

export interface GateState {
  portfolio_topics: string[];
  conversation: { from: 'visitor' | 'assistant'; text: string }[];
  latest_question: string;
}

/** What the classifier reads: the last turns, with earlier answers cut. */
export function gateState(
  messages: ChatTurn[],
  topics: string[] = [],
): GateState {
  const recent = messages.slice(-GATE_HISTORY_TURNS);
  const latest = recent.at(-1)?.content ?? '';
  return {
    portfolio_topics: topics,
    conversation: recent.slice(0, -1).map((turn) =>
      turn.role === 'user'
        ? { from: 'visitor', text: turn.content }
        : {
            from: 'assistant',
            text:
              turn.content.length > GATE_ANSWER_CHARS
                ? `${turn.content.slice(0, GATE_ANSWER_CHARS)}…`
                : turn.content,
          },
    ),
    latest_question: latest,
  };
}

/**
 * Instructions of the in-scope question. Written in general terms, without
 * the content: whether he used a technology is Claude's call, not the gate's
 * ("has he used Rust?" is in scope even if the answer is no).
 */
export const IN_SCOPE_INSTRUCTIONS = {
  task: 'The state is a conversation with the assistant of a personal portfolio website. The assistant only talks about the professional profile of the portfolio author, a software engineer. portfolio_topics lists the companies he worked for and the projects, products, writing and education in his portfolio. Is the latest_question, read together with the earlier conversation, something that assistant should answer?',
  in_scope: [
    'Any question about a company, app, product, project or topic in portfolio_topics, even if it does not mention the author ("How many users did the Tuenti Android app have?", "What was the ZKTeco SDK for?", "What is indexa-mcp?").',
    "The author's work experience, employers, roles, projects, achievements and dates.",
    'Technologies, languages, tools, practices or skills, including ones he may never have used ("has he used Rust?").',
    'Education, certifications, talks, writing and side projects.',
    'Fit for a company, team or role, and why someone should hire him.',
    'How to contact him, his CV, and how this portfolio website or its assistant is built.',
    'Greetings, thanks and small talk that opens or closes a conversation about him.',
    'Short follow-ups that only make sense with the earlier conversation ("and at Merlyn?", "tell me more", "in English please").',
    'Questions in any language, including Spanish, English or a mix of both.',
  ],
  out_of_scope: [
    'General knowledge, news, weather, recipes, cooking, travel, health, sports or entertainment.',
    'Writing, translating, explaining or debugging code or text for the visitor.',
    'Homework, essays, maths or any task unrelated to the author.',
    'Opinions on other people, companies or politics.',
    'Using the assistant as a general chatbot, role play or jokes.',
  ],
  mixed:
    'If the latest question mixes an in-scope request with an out-of-scope one, answer yes: the assistant will handle the in-scope part.',
};

export const LANGUAGE_INSTRUCTIONS =
  'In which language is the latest_question written? Judge by its ordinary words, not by product or technology names.';

export const LANGUAGE_CRITERIA = {
  es: 'Spanish',
  en: 'English',
} as const;

/** Below this probability the language falls back to the page locale. */
export const LANGUAGE_MIN_PROBABILITY = 0.6;
