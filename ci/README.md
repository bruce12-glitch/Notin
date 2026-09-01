# CI workflow staging

`ci/e2e.yml` contains the complete release-gate workflow. It installs all three
packages, verifies syntax and the reproducible browser bundle, audits runtime
dependencies, runs SQLite migrations, checks fail-closed production startup,
rehearses PostgreSQL 16, and executes the complete Playwright suite.

The Arena GitHub App cannot push files under `.github/workflows/` because its
token does not have the GitHub `workflows` permission. After this pull request
is merged, a repository administrator should activate it with:

```bash
mkdir -p .github/workflows
git mv ci/e2e.yml .github/workflows/e2e.yml
git commit -m "ci: activate release gates"
git push
```

Then make the `E2E` job a required branch-protection check for `main`.

## `ci/checks.sh` — local pre-push gate

`ci/checks.sh` runs the fast half of the release gates on your machine:
syntax checks for all three packages, a bundle-freshness check for
`authentication/app.bundle.js`, and a guard against accidentally tracking a
`.env` file.

```bash
./ci/checks.sh
```

It exits non-zero on the first failing category and prints a summary. The
Playwright suite is deliberately excluded so the script stays quick; run
`npm --prefix backend run test:e2e` before opening a pull request.
