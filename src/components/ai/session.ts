import type { ConsoleEvent } from '../console/core/events';
import type { Locale } from '../../lib/locales';
import { streamAnswer, type StreamEvent, type StreamOptions } from './client';
import { Conversation } from './conversation';
import { degradedForMs, type AiFailure } from './errors';
import {
  LIMITS,
  type OfferAnalysis,
  type SourceRef,
  type WireEvent,
} from './protocol';

/** What the session needs to show; the DOM implementation is in `view.ts`. */
export interface AnswerView {
  /** Text just received. Resolves when it has been shown (paced). */
  append(delta: string): Promise<void>;
  /** The answer is complete. `text` is all of it. */
  finish(result: AnswerResult): void;
  /** It failed. `partial` is what had arrived (may be empty). */
  fail(failure: AiFailure, partial: string): void;
}

export type DoneEvent = Extract<WireEvent, { type: 'done' }>;

export interface AnswerResult {
  readonly text: string;
  readonly done: DoneEvent;
  readonly sources: readonly SourceRef[];
}

/** What an offer analysis needs to show (S11); DOM in `offer-view.ts`. */
export interface OfferView {
  finish(result: OfferResult): void;
  fail(failure: AiFailure): void;
}

export interface OfferResult {
  readonly analysis: OfferAnalysis;
  readonly done: DoneEvent;
  readonly sources: readonly SourceRef[];
}

export interface SessionDeps {
  readonly url: string;
  readonly tokens: { token(): Promise<string> };
  readonly emit: (event: ConsoleEvent) => void;
  /** Injected in tests. */
  readonly stream?: (options: StreamOptions) => AsyncIterable<StreamEvent>;
  readonly now?: () => number;
}

/**
 * One visitor's conversation with the AI on this page: the question flow
 * without any DOM, so it can be tested with a fake view and a fake stream.
 * (Like a presenter or ViewModel that talks to the screen through an
 * interface.)
 */
export class AiSession {
  readonly conversation = new Conversation();
  private degraded: { until: number; failure: AiFailure } | undefined;

  constructor(private readonly deps: SessionDeps) {}

  /** Starts a new conversation (`clear`). Degraded mode stays: it's about the service. */
  reset(): void {
    this.conversation.reset();
  }

  async ask(question: string, locale: Locale, view: AnswerView): Promise<void> {
    const reject = (failure: AiFailure, track = false) => {
      view.fail(failure, '');
      if (track) this.deps.emit({ type: 'ai-error', code: failure.code });
    };

    if (this.conversation.isFull) return reject({ code: 'turn_limit' });
    if (question.length > LIMITS.maxQuestionChars) {
      return reject({ code: 'too_long' });
    }
    const now = this.deps.now?.() ?? Date.now();
    if (this.degraded && now < this.degraded.until) {
      return reject(this.degraded.failure);
    }

    try {
      await this.run(question, locale, view);
    } catch {
      // A bug or an exotic browser must not leave the console hanging.
      view.fail({ code: 'bad_response' }, '');
      this.deps.emit({ type: 'ai-error', code: 'bad_response' });
    }
  }

  /**
   * Sends a job offer to analyze (S11). One request, no conversation: the
   * analysis isn't added to the chat history. Same Turnstile retry and
   * degraded mode as questions.
   */
  async analyzeOffer(
    offer: string,
    company: string | undefined,
    locale: Locale,
    view: OfferView,
  ): Promise<void> {
    const text = offer.trim();
    if (text.length > LIMITS.maxOfferChars) {
      return view.fail({ code: 'too_long' });
    }
    const now = this.deps.now?.() ?? Date.now();
    if (this.degraded && now < this.degraded.until) {
      return view.fail(this.degraded.failure);
    }
    try {
      await this.runOffer(text, company, locale, view);
    } catch {
      view.fail({ code: 'bad_response' });
      this.deps.emit({ type: 'ai-error', code: 'bad_response' });
    }
  }

  private async runOffer(
    offer: string,
    company: string | undefined,
    locale: Locale,
    view: OfferView,
  ): Promise<void> {
    const stream = this.deps.stream ?? streamAnswer;
    let failure: AiFailure | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      failure = undefined;
      let analysis: OfferAnalysis | undefined;

      let turnstileToken: string;
      try {
        turnstileToken = await this.deps.tokens.token();
      } catch {
        failure = { code: 'turnstile_unavailable' };
        break;
      }

      for await (const event of stream({
        url: this.deps.url,
        request: {
          mode: 'offer',
          locale,
          ...(company ? { company } : {}),
          offer,
          turnstileToken,
        },
        // An analysis arrives all at once, after the model has finished.
        timeoutMs: 90_000,
      })) {
        if (event.type === 'analysis') {
          analysis = event.analysis;
        } else if (event.type === 'done') {
          if (!analysis) {
            failure = { code: 'bad_response' };
            break;
          }
          view.finish({ analysis, done: event, sources: event.sources });
          this.deps.emit({
            type: 'offer-analyzed',
            matches: analysis.matches.length,
            gaps: analysis.gaps.length,
          });
          return;
        } else if (event.type === 'error') {
          failure = event.failure;
        }
      }

      const retry = failure?.code === 'turnstile_failed' && attempt === 1;
      if (!retry) break;
    }

    failure ??= { code: 'interrupted' };
    const pause = degradedForMs(failure.code);
    if (pause > 0) {
      const now = this.deps.now?.() ?? Date.now();
      this.degraded = { until: now + pause, failure };
    }
    view.fail(failure);
    this.deps.emit({ type: 'ai-error', code: failure.code });
  }

  private async run(
    question: string,
    locale: Locale,
    view: AnswerView,
  ): Promise<void> {
    const stream = this.deps.stream ?? streamAnswer;
    const messages = this.conversation.messagesFor(question);
    let failure: AiFailure | undefined;
    let text = '';

    // One retry, only for a rejected Turnstile token: tokens are single-use
    // and expire, so a fresh one is the fix. Anything else would just repeat.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      failure = undefined;
      text = '';

      let turnstileToken: string;
      try {
        turnstileToken = await this.deps.tokens.token();
      } catch {
        failure = { code: 'turnstile_unavailable' };
        break;
      }

      for await (const event of stream({
        url: this.deps.url,
        request: { locale, messages, turnstileToken },
      })) {
        if (event.type === 'delta') {
          text += event.text;
          await view.append(event.text);
        } else if (event.type === 'done') {
          this.conversation.commit(question, text);
          view.finish({ text, done: event, sources: event.sources });
          this.deps.emit({ type: 'ai-answered', stopReason: event.stopReason });
          return;
        } else if (event.type === 'error') {
          failure = event.failure;
        }
      }

      const retry =
        failure?.code === 'turnstile_failed' && text === '' && attempt === 1;
      if (!retry) break;
    }

    failure ??= { code: 'interrupted' };
    const pause = degradedForMs(failure.code);
    if (pause > 0) {
      const now = this.deps.now?.() ?? Date.now();
      this.degraded = { until: now + pause, failure };
    }
    view.fail(failure, text);
    this.deps.emit({ type: 'ai-error', code: failure.code });
  }
}
