/**
 * Reading the AI question log (S09): the Lambda writes one item per question
 * under `log#<YYYY-MM-DD>` (see src/server/ai/store-dynamo.ts). These helpers
 * are pure; scripts/ai-questions.ts does the DynamoDB calls.
 */
import type { QuestionLogEntry } from '../../src/server/ai/store';

/** Partition keys for the last `days` days, newest first, ending at `now`. */
export function logPartitions(days: number, now: Date): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(now.getTime() - i * 86_400_000);
    keys.push(`log#${day.toISOString().slice(0, 10)}`);
  }
  return keys;
}

export interface ParsedArgs {
  days: number;
  full: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  let days = 7;
  const i = argv.indexOf('--days');
  if (i !== -1) {
    const value = Number(argv[i + 1]);
    if (!Number.isInteger(value) || value < 1 || value > 90) {
      throw new Error('--days must be a whole number between 1 and 90');
    }
    days = value;
  }
  return { days, full: argv.includes('--full') };
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

function shorten(text: string, max: number): string {
  const line = oneLine(text);
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/** One readable block per question, oldest first within the output. */
export function formatEntries(
  entries: QuestionLogEntry[],
  options: { full: boolean },
): string {
  if (entries.length === 0) return 'No questions in this period.';
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const blocks = sorted.map((e) => {
    const when = e.at.slice(0, 16).replace('T', ' ');
    const head = `${when} UTC · ${e.locale} · turn ${e.turn} · ${e.outcome}`;
    const answer = options.full ? e.answer.trim() : shorten(e.answer, 160);
    const sources = e.sources.length
      ? `\n  sources: ${e.sources.join(', ')}`
      : '';
    return `${head}\n  Q: ${oneLine(e.question)}\n  A: ${answer}${sources}`;
  });
  const declined = sorted.filter((e) => e.outcome !== 'answered').length;
  return `${blocks.join('\n\n')}\n\n${sorted.length} questions, ${declined} cut short (refusal, limit or error).`;
}
