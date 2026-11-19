/**
 * ES -> EN translation (docs/specs/13-translation.md): translators (Claude and
 * a fake one), hash-based planning, validation and the file-writing pipeline.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Document, isSeq, stringify } from 'yaml';
import { loadContent, repoRoot, type SourceEntry } from './content-source';
import { hashText } from './embeddings';

export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** The translatable part of an item or note. */
export interface TextFields {
  title: string;
  summary?: string | undefined;
  tags: string[];
  body: string;
}

export interface Translator {
  readonly model: string;
  translate(source: TextFields): Promise<TextFields>;
}

// ------------------------------------------------------------------ hash

/** Fingerprint of what gets translated: only text changes invalidate it. */
export function hashSource(source: TextFields): string {
  return hashText(
    JSON.stringify({
      title: source.title,
      summary: source.summary ?? null,
      tags: source.tags,
      body: source.body.trim(),
    }),
  );
}

// ------------------------------------------------------------ validation

const fences = (text: string) => (text.match(/^\s*```/gm) ?? []).length;
const urls = (text: string) => text.match(/https?:\/\/[^\s)>\]"'`]+/g) ?? [];

/** Returns problems with a translation (empty array = accepted). */
export function validateTranslation(
  source: TextFields,
  result: TextFields,
): string[] {
  const problems: string[] = [];
  if (!result.title.trim()) problems.push('empty title');
  if (source.summary && !result.summary?.trim()) problems.push('empty summary');
  if (result.summary?.includes('\n')) problems.push('summary is not one line');
  if (result.tags.length !== source.tags.length) {
    problems.push(
      `expected ${source.tags.length} tags, got ${result.tags.length}`,
    );
  }
  if (fences(result.body) !== fences(source.body)) {
    problems.push('code fence count differs');
  }
  for (const url of urls(source.body)) {
    if (!result.body.includes(url)) problems.push(`URL missing: ${url}`);
  }
  if (source.body.trim() && !result.body.trim()) problems.push('empty body');
  return problems;
}

// ------------------------------------------------------------ translators

/** Deterministic stand-in for tests and for trying the flow without a key. */
export function createFakeTranslator(): Translator {
  return {
    model: 'fake-translator',
    translate(source) {
      return Promise.resolve({
        title: `[EN fake] ${source.title}`,
        ...(source.summary ? { summary: `[EN fake] ${source.summary}` } : {}),
        tags: source.tags,
        body: source.body.trim() ? `[EN fake]\n\n${source.body.trim()}` : '',
      });
    },
  };
}

const SYSTEM_PROMPT = `You translate content for a software engineer's bilingual portfolio website from Spanish to English.

Rules:
- Write natural, concise technical English in the author's first-person voice where the source uses it.
- Keep the Markdown structure exactly: headings, lists, links, emphasis. Do not add, remove or reorder content.
- Do not translate or change code blocks, inline code, URLs, file names, identifiers or ids.
- Keep proper nouns and technical terms as they are (Kotlin, Jetpack Compose, AWS, Android, company and product names).
- "tags" is a list of short lowercase labels: translate only when the English word differs, keep the same number of tags in the same order.
- "summary" must stay a single line.
- If a field is empty in the input, return it empty.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    body: { type: 'string' },
  },
  required: ['title', 'summary', 'tags', 'body'],
  additionalProperties: false,
} as const;

export interface ClaudeTranslatorOptions {
  /** Defaults to `ANTHROPIC_API_KEY` via the SDK. */
  client?: Pick<Anthropic, 'messages'>;
  model?: string;
}

/** Translates with Claude through the official SDK, one call per text. */
export function createClaudeTranslator(
  options: ClaudeTranslatorOptions = {},
): Translator {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? DEFAULT_MODEL;
  return {
    model,
    async translate(source) {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              title: source.title,
              summary: source.summary ?? '',
              tags: source.tags,
              body: source.body.trim(),
            }),
          },
        ],
      });
      if (response.stop_reason === 'refusal') {
        throw new Error('Claude declined to translate this text');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('The translation was cut off (max_tokens)');
      }
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      return parseTranslation(text, source);
    },
  };
}

/** Parses the model's JSON answer; throws a readable error if malformed. */
export function parseTranslation(text: string, source: TextFields): TextFields {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error('The model did not return valid JSON', { cause: error });
  }
  const o = json as Record<string, unknown>;
  if (
    typeof o.title !== 'string' ||
    typeof o.summary !== 'string' ||
    typeof o.body !== 'string' ||
    !Array.isArray(o.tags) ||
    !o.tags.every((t) => typeof t === 'string')
  ) {
    throw new Error('The model answer does not match the expected shape');
  }
  const summary = o.summary.replace(/\s*\n\s*/g, ' ').trim();
  return {
    title: o.title.trim(),
    ...(source.summary ? { summary } : {}),
    tags: o.tags as string[],
    body: o.body.trim(),
  };
}

// --------------------------------------------------------------- planning

export type Action =
  | 'create'
  | 'retranslate'
  | 'retranslate-reviewed'
  | 'skip'
  | 'unhashed-reviewed';

/** What to do for one ES entry given its EN counterpart (spec S13 table). */
export function planAction(
  sourceHash: string,
  en: { review: string; sourceHash?: string | undefined } | undefined,
): Action {
  if (!en) return 'create';
  if (en.sourceHash === sourceHash) return 'skip';
  if (en.review === 'reviewed') {
    return en.sourceHash ? 'retranslate-reviewed' : 'unhashed-reviewed';
  }
  return 'retranslate';
}

// --------------------------------------------------------------- writing

/** Frontmatter + body of an EN file, keeping unknown keys and key order. */
export function renderEnglishFile(
  existing: Record<string, unknown> | undefined,
  fields: TextFields,
  sourceHash: string,
): string {
  const data: Record<string, unknown> = { ...(existing ?? {}) };
  data.title = fields.title;
  data.review = 'pending';
  data.sourceHash = sourceHash;
  if (fields.summary) data.summary = fields.summary;
  else delete data.summary;
  data.tags = fields.tags;
  const doc = new Document(data);
  const tags = doc.get('tags', true);
  if (isSeq(tags)) tags.flow = true;
  const frontmatter = doc.toString({
    lineWidth: 0,
    flowCollectionPadding: false,
  });
  return `---\n${frontmatter}---\n\n${fields.body.trim()}\n`;
}

/** Same as `renderEnglishFile` but the item `type` is mandatory. */
export function englishFile(
  entry: SourceEntry<{ title: string }>,
  existing: Record<string, unknown> | undefined,
  fields: TextFields,
  sourceHash: string,
): string {
  const base = { ...(existing ?? {}) };
  if (entry.kind === 'item') base.type = entry.rawData.type;
  return renderEnglishFile(base, fields, sourceHash);
}

/** Frontmatter with only `sourceHash` updated (used by `--adopt`). */
export function stampHash(text: string, sourceHash: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error('Missing frontmatter block');
  const rest = (match[1] ?? '')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('sourceHash:'))
    .join('\n');
  return `---\n${rest}\n${stringify({ sourceHash })}---\n${match[2] ?? ''}`;
}

export function changedFields(
  before: TextFields,
  after: TextFields,
): ('title' | 'summary' | 'tags' | 'body')[] {
  const changed: ('title' | 'summary' | 'tags' | 'body')[] = [];
  if (before.title !== after.title) changed.push('title');
  if ((before.summary ?? '') !== (after.summary ?? '')) changed.push('summary');
  if (before.tags.join('|') !== after.tags.join('|')) changed.push('tags');
  if (before.body.trim() !== after.body.trim()) changed.push('body');
  return changed;
}

// -------------------------------------------------------------- pipeline

export interface TranslateOptions {
  contentRoot?: string;
  translator?: Translator;
  dryRun?: boolean;
  adopt?: boolean;
  includeFixtures?: boolean;
  only?: string;
  log?: (line: string) => void;
  /** Where changes to reviewed translations are noted (git-ignored). */
  logFile?: string;
  now?: () => Date;
}

export interface TranslateResult {
  created: string[];
  retranslated: string[];
  /** Reviewed translations sent back to `pending` because the source changed. */
  reopened: string[];
  adopted: string[];
  skipped: string[];
  warnings: string[];
  errors: string[];
}

export const defaultLogFile = join(
  repoRoot,
  'content-inbox/translation-log.md',
);

export async function runTranslate(
  options: TranslateOptions = {},
): Promise<TranslateResult> {
  const log = options.log ?? (() => undefined);
  const result: TranslateResult = {
    created: [],
    retranslated: [],
    reopened: [],
    adopted: [],
    skipped: [],
    warnings: [],
    errors: [],
  };

  const { items, notes } = loadContent(options.contentRoot);
  const all = [...items, ...notes];
  const englishByKey = new Map(
    all.filter((e) => e.lang === 'en').map((e) => [`${e.kind}/${e.id}`, e]),
  );
  const sources = all.filter(
    (e) =>
      e.lang === 'es' &&
      e.data.status === 'published' &&
      (options.includeFixtures || !e.fixture) &&
      (!options.only || e.id === options.only),
  );

  for (const es of sources) {
    const key = `${es.kind}/${es.id}`;
    const fields: TextFields = {
      title: es.data.title,
      summary: es.data.summary,
      tags: es.data.tags,
      body: es.body,
    };
    const hash = hashSource(fields);
    const en = englishByKey.get(key);
    const action = planAction(hash, en?.data);
    const enFile = join(dirname(dirname(es.file)), 'en', `${es.id}.md`);

    if (action === 'skip') {
      result.skipped.push(key);
      continue;
    }
    if (action === 'unhashed-reviewed') {
      if (options.adopt && en && !options.dryRun) {
        writeFileSync(enFile, stampHash(readFileSync(enFile, 'utf8'), hash));
        result.adopted.push(key);
        log(`${key}: stamped sourceHash on the reviewed English file.`);
      } else {
        result.warnings.push(
          `${key}: reviewed English file has no sourceHash; left untouched (use --adopt to stamp it).`,
        );
      }
      continue;
    }
    if (options.adopt) continue; // --adopt never translates

    if (options.dryRun) {
      log(`${key}: would ${action === 'create' ? 'create' : 'retranslate'}.`);
      (action === 'create' ? result.created : result.retranslated).push(key);
      continue;
    }

    if (!options.translator) {
      throw new Error('A translator is required to translate content');
    }
    try {
      const translated = await options.translator.translate(fields);
      const problems = validateTranslation(fields, translated);
      if (problems.length > 0) {
        throw new Error(`invalid translation: ${problems.join('; ')}`);
      }
      mkdirSync(dirname(enFile), { recursive: true });
      writeFileSync(enFile, englishFile(es, en?.rawData, translated, hash));
      if (action === 'create') result.created.push(key);
      else result.retranslated.push(key);
      if (action === 'retranslate-reviewed' && en) {
        result.reopened.push(key);
        noteChange(options, key, en, translated);
      }
      log(`${key}: ${action} done.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result.errors.push(`${key}: ${reason}`);
      log(`${key}: FAILED (${reason}).`);
    }
  }
  return result;
}

function noteChange(
  options: TranslateOptions,
  key: string,
  previous: SourceEntry<{
    title: string;
    summary?: string | undefined;
    tags: string[];
  }>,
  next: TextFields,
): void {
  const before: TextFields = {
    title: previous.data.title,
    summary: previous.data.summary,
    tags: previous.data.tags,
    body: previous.body,
  };
  const file = options.logFile ?? defaultLogFile;
  const date = (options.now?.() ?? new Date()).toISOString().slice(0, 10);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(
    file,
    `## ${date} ${key}\n\n` +
      `Spanish source changed; the reviewed English file went back to "pending".\n` +
      `- Changed in English: ${changedFields(before, next).join(', ') || 'nothing visible'}\n` +
      `- Previous title: ${before.title}\n` +
      `- Previous summary: ${before.summary ?? '(none)'}\n` +
      `- The previous full text is in the Git history of the file.\n\n`,
  );
}
