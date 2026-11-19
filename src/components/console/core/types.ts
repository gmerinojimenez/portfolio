import type { Locale } from '../../../lib/locales';
import type { Localized, UiStrings } from '../../../i18n/ui';
import type { ConsoleData } from '../data';
import type { Html } from './html';
import type { ParsedInput } from './parse';
import type { CommandRegistry } from './registry';

/**
 * What a command can do. The same command runs in two places:
 * - at build time, to render the boot output as static HTML
 *   (`interactive: false`; `print` collects HTML and side effects are no-ops);
 * - in the browser (`interactive: true`).
 * So commands must only talk to the page through this context.
 */
export interface CommandContext {
  readonly locale: Locale;
  readonly t: UiStrings;
  readonly data: ConsoleData;
  readonly registry: CommandRegistry;
  /** Current page path, e.g. `/es/`. */
  readonly pathname: string;
  /** `false` while rendering static HTML at build time. */
  readonly interactive: boolean;
  /**
   * The validated `?company=` of this visit (S11). Browser only: the build
   * never knows it, so static output is always the same.
   */
  readonly company?: string | undefined;
  /** Appends an output block to the console. */
  print(content: Html): void;
  /** Removes all output. */
  clear(): void;
  /** Leaves the page (e.g. language switch). */
  navigate(url: string): void;
  /** Starts a file download. */
  download(url: string, filename: string): void;
  /**
   * Waits for an animation step. Resolves immediately with reduced motion or
   * when the visitor skips, so use it for any typing or streaming effect.
   */
  sleep(ms: number): Promise<void>;
}

export interface CompletionRequest {
  /** Arguments already typed before the one being completed. */
  readonly args: readonly string[];
  /** The (possibly empty) argument being completed. */
  readonly current: string;
}

export interface Command {
  /** Canonical, stable id (used in markup and analytics). */
  readonly name: string;
  /** Name shown to visitors per language, when it differs from `name`. */
  readonly names?: Partial<Localized>;
  /** Extra accepted names (in any language). */
  readonly aliases?: readonly string[];
  /** Arguments as shown in `help`, e.g. `es|en`. */
  readonly usage?: string;
  /** One-line description for `help`. */
  readonly summary: Localized;
  /** Hidden commands work but aren't listed in `help` or completed. */
  readonly hidden?: boolean;
  /** Candidate values for the argument being completed (unfiltered). */
  complete?(request: CompletionRequest, ctx: CommandContext): readonly string[];
  /**
   * Whether these arguments are valid for the command. Input that starts
   * with a command name but fails this ("help me with Kotlin") is a question
   * for the AI, not a command. Without it, the command takes no arguments.
   */
  accepts?(input: ParsedInput): boolean;
  run(input: ParsedInput, ctx: CommandContext): void | Promise<void>;
  /**
   * Browser-only hook to make an output block interactive (event listeners,
   * animations…). Called for new output and for output rendered at build
   * time, so it is also how static HTML gets "hydrated".
   */
  enhance?(output: HTMLElement, ctx: CommandContext): void;
}

/** Handles input that isn't a command (the AI, from S10 on). */
export type FallbackHandler = (
  input: ParsedInput,
  ctx: CommandContext,
) => void | Promise<void>;
