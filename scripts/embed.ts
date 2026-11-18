/**
 * `pnpm content:embed [--check] [--fake] [--threshold 0.5]`
 * See docs/specs/06-embeddings-map.md.
 */
import { runEmbed } from './lib/embed-pipeline';

const args = process.argv.slice(2);
const thresholdIndex = args.indexOf('--threshold');
const threshold =
  thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) : undefined;
if (threshold !== undefined && !Number.isFinite(threshold)) {
  console.error('--threshold needs a number, e.g. --threshold 0.5');
  process.exit(2);
}

try {
  const result = await runEmbed({
    check: args.includes('--check'),
    fake: args.includes('--fake'),
    ...(threshold !== undefined ? { threshold } : {}),
    log: (line) => console.log(line),
  });
  if (args.includes('--check') && !result.upToDate) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
