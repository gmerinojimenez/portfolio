# Portfolio

Bilingual (ES/EN) professional portfolio and an AI lab for building with Claude in production.

## Project docs

Vision, architecture, decisions (ADRs), specs and the implementation plan live in `docs/`, starting at `docs/README.md`. Read it before working. `docs/` is kept locally and is **not committed**. In a git worktree it won't exist: read it from the main checkout (`git worktree list` shows its path).

- New decisions are recorded as ADRs in `docs/decisions/`. A decision is changed with a new ADR that supersedes the old one (ADRs written before S00 were rewritten in place).
- Open questions live in `docs/open-questions.md`. Update that file when you close one.
- Each piece of work has a short spec in `docs/specs/`, written right before implementing it.

## Rules

- **Everything committed to the repository is in English:** code, comments, tests, READMEs, this file, commit messages and PR descriptions. The exceptions are the site's own content and UI strings, which are bilingual by design, and the local `docs/`, which are in Spanish.
- Commit types: only `feat:` and `fix:`.
- The author comes from Android and is learning web development: explain frontend and web decisions.
- Budget: 20 €/month at most, in total.
