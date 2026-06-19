# Contributing

## Get it running locally

```bash
npm install
npm test          # Jest — all specs against in-memory SQLite
npm run dev       # wrangler dev — local Worker with local D1
```

For the deploy spec add:

```bash
DEPLOY_URL=https://cassini-mission-plan.redfour.workers.dev npm test
```

## Code style

- TypeScript, strict mode, no `any`. See `CLAUDE.md` for the full ruleset.
- No comments that restate what the code does — only comment the *why* when it would surprise a reader.
- Every query uses prepared statements with bound params. No SQL string concatenation.
- New tools follow the established pattern: zod schema → query function in `src/db/queries.ts` → handler registered in `src/tools/index.ts`.

## Proposing a change

Open an issue first for anything non-trivial. For small fixes, a PR is fine directly. Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(timeline): add day-level bucket granularity
fix(search): handle quote characters in FTS MATCH query
docs: update deploy steps for wrangler v4
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.

## Tests

The spec suite is in `spec/`. Each spec drives the real `default.fetch` entry point via an in-memory SQLite store injected at the `Db` boundary — no mocks that bypass production code paths. Keep it that way.

Run the full suite before submitting:

```bash
npm test
npx tsc --noEmit
```
