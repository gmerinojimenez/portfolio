import { LIMITS, type ChatTurn } from './protocol';

interface Turn {
  readonly question: string;
  readonly answer: string;
}

/**
 * The conversation of this page. The backend keeps no state: every request
 * carries the whole history, so this class is the only memory (like a
 * ViewModel that dies with the screen: reloading the page starts over).
 * Only complete turns are stored; a failed question leaves no trace, so
 * retrying it doesn't send it twice.
 */
export class Conversation {
  private turns: Turn[] = [];

  get questionsAsked(): number {
    return this.turns.length;
  }

  /** No room for another question until `reset()`. */
  get isFull(): boolean {
    return this.turns.length >= LIMITS.maxQuestions;
  }

  /** The messages to send for a new question: history + the question. */
  messagesFor(question: string): ChatTurn[] {
    return [
      ...this.turns.flatMap((turn): ChatTurn[] => [
        { role: 'user', content: turn.question },
        {
          role: 'assistant',
          content: turn.answer.slice(0, LIMITS.maxAnswerChars),
        },
      ]),
      { role: 'user', content: question.trim() },
    ];
  }

  /** Stores a finished turn. An empty answer isn't a valid message: skipped. */
  commit(question: string, answer: string): void {
    const text = answer.trim();
    if (!text || this.isFull) return;
    this.turns.push({ question: question.trim(), answer: text });
  }

  reset(): void {
    this.turns = [];
  }
}
