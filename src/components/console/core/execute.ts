import { parseInput, type ParsedInput } from './parse';
import type { CommandRegistry } from './registry';
import type { Command, CommandContext } from './types';

/** Builds the context for one run; `command` is undefined for the fallback. */
export type ContextFactory = (command: Command | undefined) => CommandContext;

export interface Execution {
  readonly input: ParsedInput;
  readonly command: Command | undefined;
}

/**
 * Runs one line of input: a registered command if the first word matches
 * one, otherwise the fallback (the AI from S10 on). Empty input does nothing.
 */
export async function execute(
  line: string,
  registry: CommandRegistry,
  makeContext: ContextFactory,
): Promise<Execution | undefined> {
  const input = parseInput(line);
  if (!input.name) return undefined;
  const command = registry.resolve(input.name);
  const ctx = makeContext(command);
  if (command) await command.run(input, ctx);
  else await registry.fallback?.(input, ctx);
  return { input, command };
}
