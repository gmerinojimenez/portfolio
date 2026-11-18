/**
 * `pnpm content:translate [--dry-run] [--fake] [--adopt] [--only <id>] [--include-fixtures]`
 * See docs/specs/13-translation.md.
 */
import {
  DEFAULT_MODEL,
  createClaudeTranslator,
  createFakeTranslator,
  runTranslate,
  type Translator,
} from './lib/translate';

const args = process.argv.slice(2);
const has = (flag: string) => args.includes(flag);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : undefined;
if (onlyIndex >= 0 && !only) {
  console.error('--only needs an id, e.g. --only my-app');
  process.exit(2);
}

try {
  const dryRun = has('--dry-run');
  const adopt = has('--adopt');
  let translator: Translator | undefined;
  if (!dryRun && !adopt) {
    if (has('--fake')) {
      translator = createFakeTranslator();
    } else if (process.env.ANTHROPIC_API_KEY) {
      translator = createClaudeTranslator({
        model: process.env.TRANSLATE_MODEL ?? DEFAULT_MODEL,
      });
    } else {
      throw new Error(
        'Set ANTHROPIC_API_KEY to translate (or use --dry-run / --fake).',
      );
    }
  }
  const result = await runTranslate({
    ...(translator ? { translator } : {}),
    dryRun,
    adopt,
    includeFixtures: has('--include-fixtures'),
    ...(only ? { only } : {}),
    log: (line) => console.log(line),
  });
  console.log(
    `Created ${result.created.length}, retranslated ${result.retranslated.length} ` +
      `(${result.reopened.length} reviewed ones reopened), adopted ${result.adopted.length}, ` +
      `unchanged ${result.skipped.length}.`,
  );
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  for (const error of result.errors) console.error(`error: ${error}`);
  if (result.reopened.length > 0) {
    console.log(
      'Reviewed translations went back to "pending"; see content-inbox/translation-log.md.',
    );
  }
  if (result.errors.length > 0) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
