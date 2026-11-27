/**
 * AI eval runner (S09; S14 compares v2 against it). Calls the real Anthropic
 * API, so it only runs when ANTHROPIC_API_KEY is set, and never in CI.
 *
 *   ANTHROPIC_API_KEY=... pnpm eval            all questions and offers
 *   ANTHROPIC_API_KEY=... pnpm eval agg-kotlin only these ids
 *   ANTHROPIC_API_KEY=... pnpm eval --offers   only the offers (S11)
 *   ANTHROPIC_API_KEY=... pnpm eval --questions
 *                                              only the questions
 *   TYPESAFE_API_KEY=... pnpm eval --gate
 *                                              only the scope gate (S17) over
 *                                              every question: no Claude calls
 *   ANTHROPIC_API_KEY=... TYPESAFE_API_KEY=... pnpm eval --with-gate
 *                                              the questions with the gate in
 *                                              enforce mode in front of Claude
 *   ANTHROPIC_API_KEY=... pnpm eval --orchestrator=langgraph
 *                                              the questions through the real
 *                                              handler with that orchestrator
 *                                              (S18; `direct` is the
 *                                              reference). Uses the gate in
 *                                              enforce mode when
 *                                              TYPESAFE_API_KEY is set, and
 *                                              traces in LangSmith (project
 *                                              portfolio-eval) when
 *                                              LANGSMITH_API_KEY is set
 *   pnpm eval --regrade evals/results/<file>.json
 *                                              re-grade saved answers with the
 *                                              current grader and questions,
 *                                              offline (no key, no API calls)
 *
 * Uses the same prompt, model, provider and context as the Lambda: every
 * published item and note in src/content. The questions in questions.json are
 * written against that content, so update them when the content changes.
 * Writes evals/results/<timestamp>.json (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { wrapAnthropic } from 'langsmith/wrappers/anthropic';
import { AnthropicProvider } from '../src/server/ai/anthropic-provider';
import { LangGraphOrchestrator } from '../src/server/ai/chat-graph';
import {
  ORCHESTRATORS,
  type OrchestratorName,
} from '../src/server/ai/chat-orchestrator';
import { EVAL_PROJECT, createTracing } from '../src/server/ai/chat-tracing';
import {
  buildAiContext,
  readContentSnapshot,
} from '../src/server/ai/context-builder';
import { DEFAULT_MAX_TOKENS } from '../src/server/ai/handler';
import { JevScopeGate, createJevClient } from '../src/server/ai/jev-scope-gate';
import { OFF_TOPIC_ANSWER } from '../src/server/ai/messages';
import {
  OFFER_MAX_TOKENS,
  offerInstructions,
  offerMessage,
  offerSchema,
} from '../src/server/ai/offer';
import {
  costMicroUsd,
  emptyUsage,
  jevCostMicroUsd,
  microUsdToUsd,
  type TokenUsage,
} from '../src/server/ai/pricing';
import { systemInstructions } from '../src/server/ai/prompt';
import {
  grade,
  gradeOffer,
  turnsOf,
  type EvalOffer,
  type EvalQuestion,
  type Grade,
  type OfferGrade,
} from './grade';
import {
  gateExpectation,
  percentile,
  summarizeGate,
  type GateOutcome,
} from './gate';
import { createEvalHandler } from './through-handler';

/** Questions with the file-wide `mustNotMentionAnywhere` added to each one. */
function loadQuestions(): EvalQuestion[] {
  const file = JSON.parse(readFileSync('evals/questions.json', 'utf8')) as {
    mustNotMentionAnywhere?: string[];
    questions: EvalQuestion[];
  };
  const everywhere = file.mustNotMentionAnywhere ?? [];
  return file.questions.map((q) => ({
    ...q,
    mustNotMention: [...(q.mustNotMention ?? []), ...everywhere],
  }));
}

function regrade(file: string): void {
  const questions = loadQuestions();
  const saved = JSON.parse(readFileSync(file, 'utf8')) as {
    results: { id: string; answer: string; grade: Grade | null }[];
  };
  const context = buildAiContext(readContentSnapshot('src/content'));
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

function writeResults(payload: unknown, suffix = ''): string {
  mkdirSync('evals/results', { recursive: true });
  const file = join(
    'evals/results',
    `${new Date().toISOString().replace(/[:.]/g, '-')}${suffix}.json`,
  );
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

const typesafeKey = process.env.TYPESAFE_API_KEY;
const scopeGate = typesafeKey
  ? new JevScopeGate(createJevClient(typesafeKey))
  : undefined;

if (process.argv.includes('--gate')) {
  if (!scopeGate) {
    console.log('TYPESAFE_API_KEY is not set: skipping the gate eval.');
    process.exit(0);
  }
  const gateContext = buildAiContext(readContentSnapshot('src/content'));
  const outcomes: GateOutcome[] = [];
  for (const q of loadQuestions()) {
    const result = await scopeGate.check({
      locale: q.locale,
      messages: turnsOf(q),
      topics: gateContext.locales[q.locale].topics ?? [],
    });
    const outcome: GateOutcome = {
      id: q.id,
      type: q.type,
      expected: gateExpectation(q),
      verdict: result.verdict,
      ...(result.verdict === 'error'
        ? { reason: result.reason }
        : { inScope: result.inScope }),
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
    };
    outcomes.push(outcome);
    const wrong =
      outcome.expected !== 'any' && outcome.verdict !== outcome.expected;
    console.log(
      `${wrong ? 'MISS' : 'ok  '}  ${q.id.padEnd(28)} ${outcome.verdict.padEnd(6)} ${outcome.inScope?.toFixed(2) ?? outcome.reason}  ${outcome.latencyMs} ms`,
    );
  }
  const report = summarizeGate(outcomes);
  const summary = {
    model: scopeGate.model,
    ...report,
    costUsd: microUsdToUsd(jevCostMicroUsd(report.inputTokens)),
  };
  const file = writeResults({ summary, outcomes }, '-gate');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${file}`);
  process.exit(0);
}

const withGate = process.argv.includes('--with-gate');
if (withGate && !scopeGate) {
  console.error('--with-gate needs TYPESAFE_API_KEY.');
  process.exit(1);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.log(
    'ANTHROPIC_API_KEY is not set: skipping the eval (no API calls made).',
  );
  process.exit(0);
}

const orchestratorArg = process.argv
  .find((a) => a.startsWith('--orchestrator='))
  ?.slice('--orchestrator='.length);
if (orchestratorArg !== undefined) {
  if (!ORCHESTRATORS.includes(orchestratorArg as OrchestratorName)) {
    console.error(`--orchestrator must be one of ${ORCHESTRATORS.join(', ')}`);
    process.exit(1);
  }
  const name = orchestratorArg as OrchestratorName;
  const langsmithKey = process.env.LANGSMITH_API_KEY;
  const tracing =
    name === 'langgraph' && langsmithKey
      ? createTracing({ apiKey: langsmithKey, projectName: EVAL_PROJECT })
      : undefined;
  const evalContext = buildAiContext(readContentSnapshot('src/content'));
  const ask = createEvalHandler({
    provider: new AnthropicProvider({
      apiKey,
      ...(tracing ? { wrapClient: (client) => wrapAnthropic(client) } : {}),
    }),
    context: evalContext,
    ...(scopeGate ? { scopeGate } : {}),
    ...(name === 'langgraph'
      ? {
          createChatOrchestrator: (steps) =>
            new LangGraphOrchestrator(steps, tracing),
        }
      : {}),
  });
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const picked = loadQuestions().filter(
    (q) => !only.length || only.includes(q.id),
  );
  const handled = [];
  // Sequential on purpose, as in the main eval: later questions hit the cache.
  for (const q of picked) {
    const reply = await ask(q.locale, turnsOf(q));
    const graded = reply.error
      ? null
      : grade(q, reply.answer, evalContext.locales[q.locale].sources);
    handled.push({ id: q.id, type: q.type, ...reply, grade: graded });
    console.log(
      `${graded?.pass ? 'PASS' : 'FAIL'}  ${q.id.padEnd(28)} first ${reply.firstDeltaMs ?? '-'} ms  total ${reply.totalMs} ms  ${reply.stopReason}${reply.error ? `  ${reply.error}` : ''}`,
    );
  }
  const firstDeltas = handled
    .map((r) => r.firstDeltaMs)
    .filter((ms): ms is number => ms !== null);
  const totals = handled.map((r) => r.totalMs);
  const summary = {
    orchestrator: name,
    tracing: tracing ? EVAL_PROJECT : false,
    scopeGate: scopeGate?.model ?? 'off',
    questions: handled.length,
    passed: handled.filter((r) => r.grade?.pass).length,
    firstDeltaMs: {
      p50: percentile(firstDeltas, 50),
      p95: percentile(firstDeltas, 95),
    },
    totalMs: { p50: percentile(totals, 50), p95: percentile(totals, 95) },
    totalCostUsd: handled.reduce((sum, r) => sum + r.costUsd, 0),
  };
  const out = writeResults(
    { summary, results: handled },
    `-orchestrator-${name}`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${out}`);
  process.exit(0);
}

const questions = loadQuestions();
const offers = (
  JSON.parse(readFileSync('evals/offers.json', 'utf8')) as {
    offers: EvalOffer[];
  }
).offers;
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const runQuestions = !args.includes('--offers');
const runOffers = !args.includes('--questions');
const selected = runQuestions
  ? only.length
    ? questions.filter((q) => only.includes(q.id))
    : questions
  : [];
const selectedOffers = runOffers
  ? only.length
    ? offers.filter((o) => only.includes(o.id))
    : offers
  : [];

const context = buildAiContext(readContentSnapshot('src/content'));
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
  /** --with-gate: the gate's verdict and score. */
  gate?: { verdict: string; inScope?: number; latencyMs: number };
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
  let gate: Result['gate'];
  let gateCost = 0;
  let rejected = false;
  if (withGate && scopeGate) {
    const checked = await scopeGate.check({
      locale: q.locale,
      messages,
      topics: context.locales[q.locale].topics ?? [],
    });
    gateCost = jevCostMicroUsd(checked.inputTokens);
    gate = {
      verdict: checked.verdict,
      ...(checked.verdict === 'error' ? {} : { inScope: checked.inScope }),
      latencyMs: checked.latencyMs,
    };
    if (checked.verdict === 'reject') {
      // As in enforce mode: the fixed answer, and Claude is not called.
      rejected = true;
      answer = OFF_TOPIC_ANSWER[checked.language ?? q.locale];
      stopReason = 'off_topic';
    }
  }
  try {
    if (!rejected)
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
    costUsd: microUsdToUsd(costMicroUsd(usage) + gateCost),
    latencyMs: Date.now() - started,
    grade: error ? null : grade(q, answer, context.locales[q.locale].sources),
    ...(error ? { error } : {}),
    manual: null,
    ...(gate ? { gate } : {}),
  };
  results.push(result);
  console.log(
    `${result.grade?.pass ? 'PASS' : 'FAIL'}  ${q.id.padEnd(28)} ${result.latencyMs} ms  $${result.costUsd.toFixed(5)}${gate ? `  gate ${gate.verdict} ${gate.inScope?.toFixed(2) ?? ''}` : ''}`,
  );
}

// Offers (S11): same prompt, schema and limits as the Lambda's offer mode.
interface OfferResult {
  id: string;
  locale: string;
  answer: string;
  stopReason: string;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  grade: OfferGrade | null;
  error?: string;
}
const offerResults: OfferResult[] = [];
for (const o of selectedOffers) {
  const known = context.locales[o.locale].sources;
  const started = Date.now();
  let answer = '';
  let usage = emptyUsage();
  let stopReason = 'error';
  let error: string | undefined;
  try {
    for await (const event of provider.stream({
      instructions: offerInstructions(o.locale),
      context: context.locales[o.locale].document,
      messages: [{ role: 'user', content: offerMessage(o.offer, o.company) }],
      maxTokens: OFFER_MAX_TOKENS,
      jsonSchema: offerSchema(known),
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
  const result: OfferResult = {
    id: o.id,
    locale: o.locale,
    answer,
    stopReason,
    usage,
    costUsd: microUsdToUsd(costMicroUsd(usage)),
    latencyMs: Date.now() - started,
    grade: error ? null : gradeOffer(o, answer, known),
    ...(error ? { error } : {}),
  };
  offerResults.push(result);
  console.log(
    `${result.grade?.pass ? 'PASS' : 'FAIL'}  ${o.id.padEnd(28)} ${result.latencyMs} ms  $${result.costUsd.toFixed(5)}${error ? `  ${error}` : ''}`,
  );
}

const byType = new Map<string, { pass: number; total: number }>();
for (const r of results) {
  const entry = byType.get(r.type) ?? { pass: 0, total: 0 };
  entry.total += 1;
  if (r.grade?.pass) entry.pass += 1;
  byType.set(r.type, entry);
}
const totalCost =
  results.reduce((sum, r) => sum + r.costUsd, 0) +
  offerResults.reduce((sum, r) => sum + r.costUsd, 0);
const summary = {
  model: provider.model,
  ...(withGate ? { scopeGate: scopeGate?.model } : {}),
  contextTokensEstimate: context.locales.es.estimatedTokens,
  questions: results.length,
  passed: results.filter((r) => r.grade?.pass).length,
  byType: Object.fromEntries(byType),
  offers: offerResults.length,
  offersPassed: offerResults.filter((r) => r.grade?.pass).length,
  totalCostUsd: totalCost,
  meanCostUsd: results.length ? totalCost / results.length : 0,
  meanLatencyMs: results.length
    ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)
    : 0,
};

const file = writeResults(
  { summary, results, offerResults },
  withGate ? '-with-gate' : '',
);
console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote ${file}`);
