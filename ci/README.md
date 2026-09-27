# CI

`.github/workflows/` is the single source of CI truth:

- `e2e.yml` — release gates: syntax + reproducible browser bundle + npm audit,
  SQLite migrations, fail-closed production startup, PostgreSQL 16 boot
  rehearsal, and the complete Playwright suite.
- `codeql.yml` — static analysis on every push/PR and weekly.
- `docker.yml` — builds the root Dockerfile and smoke-tests the container
  against a service Postgres (migrate → production boot → `/health`).

Make the `E2E` job a required branch-protection check for `main`.

## `ci/checks.sh` — local pre-push gate

`ci/checks.sh` runs the fast half of the release gates on your machine:
syntax checks for all three packages, the marketing CSP/asset guard
(`ci/check-csp.mjs` — no inline scripts on the marketing pages, no references
to removed third-party assets), the backend unit-test suite, a
bundle-freshness check for `authentication/app.bundle.js`, and a guard
against accidentally tracking a `.env` file.

```bash
./ci/checks.sh
```

It exits non-zero on the first failing category and prints a summary. The
Playwright suite is deliberately excluded so the script stays quick; run
`npm --prefix backend run test:e2e` before opening a pull request.
