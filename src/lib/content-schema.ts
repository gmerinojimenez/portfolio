import { z } from 'astro/zod';

/**
 * Zod schemas for the content collections (see docs/specs/01-content-model.md).
 *
 * Design rule: very few required fields, so half-written items still validate.
 * What a *published* item needs on top is enforced by `requirePublished`.
 */

export const itemTypes = [
  'app',
  'project',
  'education',
  'post',
  'oss',
] as const;
export type ItemType = (typeof itemTypes)[number];

export const contexts = ['work', 'personal'] as const;
export type ItemContext = (typeof contexts)[number];

export const statuses = ['draft', 'published'] as const;
export type Status = (typeof statuses)[number];

/**
 * Approximate dates are fine: `2021`, `2021-03` or `2021-03-15`.
 * YAML turns an unquoted `2021` into a number and `2021-03-15` into a Date,
 * so both are converted back to strings before checking the format.
 */
const partialDate = z.preprocess(
  (value) => {
    if (typeof value === 'number') return String(value);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value;
  },
  z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Use YYYY, YYYY-MM or YYYY-MM-DD'),
);

const idList = z.array(z.string()).default([]);

const link = z.object({
  label: z.string(),
  url: z.url(),
  /** Free-form hint for the UI icon: case-study, medium, github, play-store... */
  kind: z.string().optional(),
});

/** Fields shared by every Markdown collection. */
const base = {
  title: z.string().min(1),
  status: z.enum(statuses).default('draft'),
  /** One line. Shown on the card and used by the AI catalog (ADR 0011). */
  summary: z
    .string()
    .refine((s) => !s.includes('\n'), 'Must be a single line')
    .optional(),
  tags: z.array(z.string()).default([]),
  /**
   * Only meaningful in `en` files: whether the generated translation has been
   * reviewed by hand (ADR 0010). Ignored in `es` files.
   */
  review: z.enum(['pending', 'reviewed']).default('pending'),
  /** Reserved for the translation script (S13): hash of the Spanish source. */
  sourceHash: z.string().optional(),
};

/** Extra rules that apply only when `status: published`. */
function requirePublished<T extends z.ZodType<PublishedShape>>(
  schema: T,
  needsFrom: boolean,
) {
  return schema.superRefine((data, ctx) => {
    if (data.status !== 'published') return;
    const missing: string[] = [];
    if (!data.summary) missing.push('summary');
    if (data.tags.length === 0) missing.push('tags');
    if (needsFrom && !('from' in data && data.from)) missing.push('from');
    for (const field of missing) {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `"${field}" is required when status is "published"`,
      });
    }
  });
}

interface PublishedShape {
  status: Status;
  summary?: string | undefined;
  tags: string[];
}

export const itemSchema = requirePublished(
  z.object({
    ...base,
    type: z.enum(itemTypes),
    from: partialDate.optional(),
    to: z.union([partialDate, z.literal('present')]).optional(),
    /** Main topic: decides the cluster on the map. S06 infers it from tags if missing. */
    topic: z.string().optional(),
    /** Id of a company in the `companies` collection. */
    company: z.string().optional(),
    /** Id of the app item this item belongs to (for projects inside an app). */
    app: z.string().optional(),
    /**
     * `personal` for side projects: on the map they grow on their own stem.
     * Without it, an app or library with no company counts as personal too.
     */
    context: z.enum(contexts).optional(),
    /** Two or three letters for the map's badge when this is a main node (apps of a stage). */
    badge: z.string().min(1).max(3).optional(),
    /** Node size / label visibility on the map. 1 (minor) to 5 (flagship). */
    importance: z.number().int().min(1).max(5).default(3),
    related: idList,
    links: z.array(link).default([]),
    role: z.string().optional(),
  }),
  true,
);

export const noteSchema = requirePublished(
  z.object({
    ...base,
    date: partialDate.optional(),
    /** Item ids this note talks about. */
    related: idList,
  }),
  false,
);

export const companySchema = z.object({
  name: z.string().min(1),
  url: z.url().optional(),
  location: z.string().optional(),
  /** Two or three letters for the company's badge on the map (`Tu`, `ZK`…). */
  badge: z.string().min(1).max(3).optional(),
  /**
   * Career stage the company belongs to (`early`, `tuenti`…). On the map,
   * the trunk is made of stages; companies without one (universities,
   * course providers) don't appear on it.
   */
  stage: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and dashes')
    .optional(),
});

export type ItemData = z.infer<typeof itemSchema>;
export type NoteData = z.infer<typeof noteSchema>;
export type CompanyData = z.infer<typeof companySchema>;
