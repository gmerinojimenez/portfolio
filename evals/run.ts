/**
 * AI eval runner (S09; S14 compares v2 against it). Calls the real Anthropic
 * API, so it only runs when ANTHROPIC_API_KEY is set, and never in CI.
 *
 *   ANTHROPIC_API_KEY=... pnpm eval            all questions
 *   ANTHROPIC_API_KEY=... pnpm eval agg-kotlin only these ids
 *   pnpm eval --regrade evals/results/<file>.json
 *                                              re-grade saved answers with the
 *                                              current grader and questions,
 *                                              offline (no key, no API calls)
 *
 * Uses the same prompt, model and provider as the Lambda, with a context built
 * only from src/content/fixtures so results stay comparable as real content
 * grows. Writes evals/results/<timestamp>.json (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicProvider } from '../src/server/ai/anthropic-provider';
import {
  buildAiContext,
  readContentSnapshot,
} from '../src/server/ai/context-builder';
import { DEFAULT_MAX_TOKENS } from '../src/server/ai/handler';
import {
  costMicroUsd,
  emptyUsage,
  microUsdToUsd,
  type TokenUsage,
} from '../src/server/ai/pricing';
import { systemInstructions } from '../src/server/ai/prompt';
import { grade, turnsOf, type EvalQuestion, type Grade } from './grade';

function regrade(file: string): void {
  const { questions } = JSON.parse(
    readFileSync('evals/questions.json', 'utf8'),
  ) as { questions: EvalQuestion[] };
  const saved = JSON.parse(readFileSync(file, 'utf8')) as {
    results: { id: string; answer: string; grade: Grade | null }[];
  };
  const context = buildAiContext(readContentSnapshot('src/content'), {
    fixturesOnly: true,
  });
  let before = 0;
  let after = 0;
  let total = 0;
  for (const r of saved.results) {
    const q = questions.find((candidate) => candidate.id === r.id);
    if (!q || !r.grade) continue;
    const next = grade(q, r.answer, context.locales[q.locale].sources);
    total += 1;
    if (r.grade.pass) before += 1;
    if (next.pass) after += 1;
    if (r.grade.pass !== next.pass) {
      console.log(`${r.grade.pass ? 'PASS->FAIL' : 'FAIL->PASS'}  ${r.id}`);
    } else if (!next.pass) {
      console.log(`still FAIL   ${r.id}`);
    }
  }
  console.log(`Before: ${before}/${total}. After: ${after}/${total}.`);
}

const regradeAt = process.argv.indexOf('--regrade');
if (regradeAt !== -1) {
  const file = process.argv[regradeAt + 1];
  if (!file) {
    console.error('Usage: pnpm eval --regrade <results file>');
    process.exit(1);
  }
  regrade(file);
  process.exit(0);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log(
    'ANTHROPIC_API_KEY is not set: skipping the eval (no API calls made).',
  );
  process.exit(0);
}

const { questions } = JSON.parse(
  readFileSync('evals/questions.json', 'utf8'),
) as { questions: EvalQuestion[] };
const only = process.argv.slice(2);
const selected = only.length
  ? questions.filter((q) => only.includes(q.id))
  : questions;

const context = buildAiContext(readContentSnapshot('src/content'), {
  fixturesOnly: true,
});
const provider = new AnthropicProvider({ apiKey });

interface Result {
  id: string;
  type: string;
  locale: string;
  question: string;
  answer: string;
  stopReason: string;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  grade: Grade | null;
  error?: string;
  /** Fill in by hand: 0 (bad) to 2 (good) for tone and usefulness. */
  manual: number | null;
}

const results: Result[] = [];
// Sequential on purpose: the second question onwards should hit the cache.
for (const q of selected) {
  const messages = turnsOf(q);
  const started = Date.now();
  let answer = '';
  let usage = emptyUsage();
  let stopReason = 'error';
  let error: string | undefined;
  try {
    for await (const event of provider.stream({
      instructions: systemInstructions(q.locale),
      context: context.locales[q.locale].document,
      messages,
      maxTokens: DEFAULT_MAX_TOKENS,
    })) {
      if (event.type === 'text') answer += event.text;
      else {
        usage = event.usage;
        stopReason = event.stopReason;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const result: Result = {
    id: q.id,
    type: q.type,
    locale: q.locale,
    question: messages.at(-1)?.content ?? '',
    answer,
    stopReason,
    usage,
    costUsd: microUsdToUsd(costMicroUsd(usage)),
    latencyMs: Date.now() - started,
    grade: error ? null : grade(q, answer, context.locales[q.locale].sources),
    ...(error ? { error } : {}),
    manual: null,
  };
  results.push(result);
  console.log(
    `${result.grade?.pass ? 'PASS' : 'FAIL'}  ${q.id.padEnd(28)} ${result.latencyMs} ms  $${result.costUsd.toFixed(5)}`,
  );
}

const byType = new Map<string, { pass: number; total: number }>();
for (const r of results) {
  const entry = byType.get(r.type) ?? { pass: 0, total: 0 };
  entry.total += 1;
  if (r.grade?.pass) entry.pass += 1;
  byType.set(r.type, entry);
}
const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
const summary = {
  model: provider.model,
  contextTokensEstimate: context.locales.es.estimatedTokens,
  questions: results.length,
  passed: results.filter((r) => r.grade?.pass).length,
  byType: Object.fromEntries(byType),
  totalCostUsd: totalCost,
  meanCostUsd: results.length ? totalCost / results.length : 0,
  meanLatencyMs: results.length
    ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
    : 0,
};

mkdirSync('evals/results', { recursive: true });
const file = join(
  'evals/results',
  `${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);
writeFileSync(file, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${file}`);
