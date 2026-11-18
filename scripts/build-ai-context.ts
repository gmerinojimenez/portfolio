/**
 * Writes .ai-context/context.json: every published item and note, one
 * document per locale, for the AI Lambda (S09). `sst deploy` runs the same
 * code on its own; use this to inspect the document.
 *
 *   pnpm ai:context              all published content
 *   pnpm ai:context --fixtures   sample data only (what the eval uses)
 */
import { writeAiContext } from '../src/server/ai/context-builder';

const fixturesOnly = process.argv.includes('--fixtures');
const { path, context } = writeAiContext(undefined, undefined, {
  fixturesOnly,
});

for (const [locale, { sources, estimatedTokens, document }] of Object.entries(
  context.locales,
)) {
  console.log(
    `${locale}: ${sources.length} sources, ${document.length} chars, ~${estimatedTokens} tokens`,
  );
}
console.log(`Wrote ${path}`);
