import type { Locale } from '../../lib/locales';
import { useTranslations } from '../../i18n/ui';
import type { CommandRegistry } from './core/registry';

export interface QuickCommand {
  /** Visible label. */
  readonly label: string;
  /** What gets typed into the console. */
  readonly input: string;
}

/** Sentinel for the sample natural-language question. */
const QUESTION = Symbol('question');

/**
 * Buttons under the prompt, in the order of ui-direction.md. Commands that
 * aren't registered yet (`ls`, `analiza-oferta`) are skipped until their
 * spec registers them.
 */
const ORDER = [
  'map',
  'ls',
  'cv',
  'contacto',
  'analiza-oferta',
  QUESTION,
  'help',
] as const;

export function quickCommands(
  registry: CommandRegistry,
  locale: Locale,
): QuickCommand[] {
  const t = useTranslations(locale);
  return ORDER.flatMap((entry): QuickCommand[] => {
    if (entry === QUESTION) {
      return [
        { label: t.boot.quickQuestionLabel, input: t.boot.quickQuestion },
      ];
    }
    const command = registry.resolve(entry);
    if (!command) return [];
    const name = registry.displayName(command, locale);
    return [{ label: name, input: name }];
  });
}
