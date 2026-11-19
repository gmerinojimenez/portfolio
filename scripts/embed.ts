/**
 * `pnpm content:embed [--check] [--fake]`
 * See docs/specs/06-embeddings-map.md (the map part is superseded by ADR 0015).
 */
import { runEmbed } from './lib/embed-pipeline';

const args = process.argv.slice(2);

try {
  const result = await runEmbed({
    check: args.includes('--check'),
    fake: args.includes('--fake'),
    log: (line) => console.log(line),
  });
  if (args.includes('--check') && !result.upToDate) process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
