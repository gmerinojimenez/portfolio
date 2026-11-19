---
description: Interview the author (in Spanish) and write a new content item
argument-hint: [optional free-text notes or a path in content-inbox/]
---

You are helping the author add a new item to the portfolio content. Talk to the
author **in Spanish**, one or two questions at a time, short and friendly. The
files you write follow the rules below.

Input from the author (may be empty): $ARGUMENTS

If it is a path (for example in `content-inbox/`), read it first and use it to
pre-fill answers; only ask about what is missing.

## 1. Learn the schema

Read `src/lib/content-schema.ts` (the source of truth) and
`src/content/_templates/item.md`. List `src/content/items/es/` and
`src/content/companies/` (also `src/content/fixtures/` is sample data: ignore it
for suggestions) so you know the existing ids.

## 2. Interview

Ask, in this order, skipping what is already known:

1. What is it, and what type? `app`, `project`, `education`, `post` or `oss`.
2. Title and a one-line summary (offer a draft summary and let them edit it).
3. When (approximate is fine) and company or context. If the company does not
   exist yet, offer to create `src/content/companies/<id>.yaml` (`name`, optional
   `url`, `location`, and `stage` if it is a job: the career stage it belongs to
   on the map's trunk). Side projects get `context: personal`.
4. Tags (technologies and topics) and the main `topic`.
5. Does it belong to an existing app (`app`)? Which existing items are related
   (`related`)? Suggest candidates from the existing ids and check they exist.
6. Importance from 1 to 5.
7. Links (case study, Medium, GitHub, Google Play...).
8. Body: ask for the story (context, problem, decisions, results) and write it
   as clean Markdown in Spanish. Do not invent facts or metrics: leave out what
   the author did not say.

If the author does not have everything, that is fine: write what you have with
`status: draft`.

## 3. Write the file

- Path: `src/content/items/es/<id>.md`. The id is a kebab-case slug of the title
  without accents, unique across `src/content/items/es/` and the fixtures.
- Frontmatter in English keys, values in Spanish. Quote nothing unless YAML needs it.
- `status: published` only if the author says it is ready AND it has `summary`,
  `tags` and `from`. Otherwise `status: draft`.
- Never write `src/content/items/en/`: English is generated and reviewed later.
- Do not add fields that are not in the schema.

## 4. Validate

Run `pnpm test` (it checks that `related`, `app` and `company` ids exist) and
`pnpm astro check`. Fix any error and rerun. Then tell the author, in Spanish:
the file path, whether it is draft or published, what is still missing to
publish it, and that `pnpm dev` shows drafts while the production build hides them.
Do not commit unless asked.
