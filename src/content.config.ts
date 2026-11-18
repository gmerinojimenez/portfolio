import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { companySchema, itemSchema, noteSchema } from './lib/content-schema';

/**
 * Collection ids are the file path without extension, relative to src/content:
 *   items/es/my-app        real content, Spanish source
 *   items/en/my-app        generated + reviewed English version
 *   fixtures/items/es/...  sample data (delete src/content/fixtures to remove it)
 * `src/lib/content.ts` turns these paths into { id, lang, fixture }.
 */
const base = './src/content';
const generateId = ({ entry }: { entry: string }) =>
  entry.replace(/\.[^.]+$/, '');

const items = defineCollection({
  loader: glob({
    base,
    pattern: ['items/**/*.md', 'fixtures/items/**/*.md'],
    generateId,
  }),
  schema: itemSchema,
});

const notes = defineCollection({
  loader: glob({
    base,
    pattern: ['notes/**/*.md', 'fixtures/notes/**/*.md'],
    generateId,
  }),
  schema: noteSchema,
});

const companies = defineCollection({
  loader: glob({
    base,
    pattern: ['companies/**/*.yaml', 'fixtures/companies/**/*.yaml'],
    generateId,
  }),
  schema: companySchema,
});

export const collections = { items, notes, companies };
