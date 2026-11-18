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
 * The command this input runs, if it is a command: the first word names one
 * and the arguments are valid for it. Otherwise `undefined` (a question for
 * the AI, e.g. "help me with Kotlin").
 */
export function commandFor(
  input: ParsedInput,
  registry: CommandRegistry,
): Command | undefined {
  const command = registry.resolve(input.name);
  if (!command) return undefined;
  const valid = command.accepts
    ? command.accepts(input)
    : input.args.length === 0;
  return valid ? command : undefined;
}

/**
 * Runs one line of input: a registered command if the first word matches
 * one with valid arguments (see `commandFor`), otherwise the fallback (the AI
 * from S10 on). Empty input does nothing.
 */
export async function execute(
  line: string,
  registry: CommandRegistry,
  makeContext: ContextFactory,
): Promise<Execution | undefined> {
  const input = parseInput(line);
  if (!input.name) return undefined;
  const command = commandFor(input, registry);
  const ctx = makeContext(command);
  if (command) await command.run(input, ctx);
  else await registry.fallback?.(input, ctx);
  return { input, command };
}
