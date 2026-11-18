# Portfolio

Bilingual (ES/EN) portfolio site built with Astro, deployed on AWS with SST, with Claude features via the Anthropic API.

## Conventions

- Everything committed is in English: code, comments, tests, READMEs, commit messages and PR descriptions. The site's content and UI strings are bilingual by design.
- Commit types: only `feat:` and `fix:`.
- Before committing, run `pnpm check`, `pnpm test` and `pnpm build`.
- Keep TypeScript below 7: `@astrojs/check` doesn't support it yet.
