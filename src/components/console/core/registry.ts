import type { Locale } from '../../../lib/locales';
import type { Command, FallbackHandler } from './types';

export interface RegisterOptions {
  /** Replace an existing command with the same `name` (keeps its position). */
  readonly replace?: boolean;
}

/**
 * The set of commands the console understands. Other specs extend it:
 * S05 registers `ls`/`cat`, S07 replaces `map`, S10 sets the fallback.
 */
export class CommandRegistry {
  private readonly commands: Command[] = [];
  private readonly lookup = new Map<string, Command>();
  private fallbackHandler: FallbackHandler | undefined;

  register(command: Command, options: RegisterOptions = {}): this {
    const existing = this.commands.findIndex((c) => c.name === command.name);
    if (existing >= 0 && !options.replace) {
      throw new Error(`Command "${command.name}" is already registered`);
    }
    const previous = existing >= 0 ? this.commands[existing] : undefined;
    if (previous) this.unindex(previous);

    for (const word of wordsOf(command)) {
      const owner = this.lookup.get(word);
      if (owner) {
        if (previous) this.index(previous);
        throw new Error(
          `"${word}" of command "${command.name}" is already used by "${owner.name}"`,
        );
      }
    }

    if (existing >= 0) this.commands[existing] = command;
    else this.commands.push(command);
    this.index(command);
    return this;
  }

  /** Finds a command by any of its names or aliases (case-insensitive). */
  resolve(word: string): Command | undefined {
    return this.lookup.get(word.toLowerCase());
  }

  has(word: string): boolean {
    return this.resolve(word) !== undefined;
  }

  /** All commands, in registration order. */
  list(): readonly Command[] {
    return this.commands;
  }

  /** Commands shown in `help` and offered by completion. */
  visible(): readonly Command[] {
    return this.commands.filter((c) => !c.hidden);
  }

  /** Name to show (and type) for a command in a language. */
  displayName(command: Command, locale: Locale): string {
    return command.names?.[locale] ?? command.name;
  }

  /** Names offered by Tab completion in a language. */
  completionNames(locale: Locale): string[] {
    return this.visible().map((c) => this.displayName(c, locale));
  }

  setFallback(handler: FallbackHandler): this {
    this.fallbackHandler = handler;
    return this;
  }

  get fallback(): FallbackHandler | undefined {
    return this.fallbackHandler;
  }

  private index(command: Command): void {
    for (const word of wordsOf(command)) this.lookup.set(word, command);
  }

  private unindex(command: Command): void {
    for (const word of wordsOf(command)) this.lookup.delete(word);
  }
}

function wordsOf(command: Command): Set<string> {
  const words = [
    command.name,
    ...Object.values(command.names ?? {}),
    ...(command.aliases ?? []),
  ];
  return new Set(words.map((w) => w.toLowerCase()));
}
