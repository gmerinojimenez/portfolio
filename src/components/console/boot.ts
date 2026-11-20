import type { Locale } from '../../lib/locales';
import { useTranslations } from '../../i18n/ui';
import type { ConsoleData } from './data';
import { commandButton, echoLine, outputBlock } from './core/blocks';
import { join, markup, type Html } from './core/html';
import type { CommandRegistry } from './core/registry';
import type { CommandContext } from './core/types';

/** Commands the console "types" by itself when it opens. */
export const BOOT_COMMANDS = ['whoami', 'map'] as const;

export interface RenderOptions {
  readonly registry: CommandRegistry;
  readonly locale: Locale;
  readonly data: ConsoleData;
  readonly pathname: string;
}

/**
 * Runs a command at build time and returns its output as HTML: the same code
 * path as in the browser, with a context that collects instead of drawing.
 */
export async function renderCommand(
  line: string,
  options: RenderOptions,
): Promise<Html> {
  const { registry, locale, data, pathname } = options;
  const [name = '', ...args] = line.trim().split(/\s+/);
  const command = registry.resolve(name);
  if (!command) throw new Error(`Unknown boot command "${name}"`);
  const blocks: Html[] = [];
  const ctx: CommandContext = {
    locale,
    t: useTranslations(locale),
    data,
    registry,
    pathname,
    interactive: false,
    print: (content) => blocks.push(outputBlock(command.name, content)),
    clear: () => blocks.splice(0),
    navigate: () => {},
    openTab: () => {},
    sleep: () => Promise.resolve(),
  };
  await command.run({ raw: line, name, args, argText: args.join(' ') }, ctx);
  return join(blocks);
}

/**
 * The boot sequence as static HTML. Each step is a `[data-boot]` element so
 * the runtime can replay it with a typing animation (see `runtime.ts`).
 */
export async function renderBoot(options: RenderOptions): Promise<Html> {
  const t = useTranslations(options.locale);
  const prompt = t.console.prompt;
  const steps: Html[] = [
    markup`<div class="c-step" data-boot><p class="c-dim c-small">${t.boot.hintBefore}${commandButton('help')}${t.boot.hintAfter}</p></div>`,
  ];
  for (const line of BOOT_COMMANDS) {
    const command = options.registry.resolve(line);
    const shown = command
      ? options.registry.displayName(command, options.locale)
      : line;
    const output = await renderCommand(line, options);
    steps.push(
      markup`<div class="c-step" data-boot="echo">${echoLine(prompt, shown)}${output}</div>`,
    );
  }
  steps.push(
    markup`<div class="c-step" data-boot><p class="c-dim">${t.boot.suggestion}${commandButton(t.boot.sampleQuestion)}</p></div>`,
  );
  return join(steps);
}
