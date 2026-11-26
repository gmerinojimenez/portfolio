/**
 * The AI context file (ADR 0011, v1): every published item and note, one
 * document per locale, generated at build time by scripts/build-ai-context.ts
 * and shipped next to the Lambda. This module only holds the types and the
 * runtime loader; the builder lives in context-builder.ts.
 */
import { readFileSync } from 'node:fs';
import type { Locale } from '../../lib/locales';

export interface SourceRef {
  id: string;
  kind: 'item' | 'note';
  title: string;
}

export interface LocaleContext {
  /** The `<portfolio_content>` document sent as the cached system block. */
  document: string;
  /** Everything the model may cite, by id. */
  sources: SourceRef[];
  /** Rough size (~3.5 chars per token), for the cost estimate and ADR 0011. */
  estimatedTokens: number;
  /**
   * Item titles and company names, for the scope gate (S17): a question about
   * "the ZKTeco SDK" is in scope even if it never mentions the author.
   */
  topics?: string[];
}

export interface AiContextFile {
  version: 1;
  locales: Record<Locale, LocaleContext>;
}

export const CONTEXT_FILE_NAME = 'context.json';

export function parseAiContext(json: string): AiContextFile {
  const data = JSON.parse(json) as Partial<AiContextFile>;
  if (data.version !== 1 || !data.locales?.es || !data.locales?.en) {
    throw new Error('AI context file has an unexpected shape');
  }
  return data as AiContextFile;
}

export function loadAiContext(path: string): AiContextFile {
  return parseAiContext(readFileSync(path, 'utf8'));
}
