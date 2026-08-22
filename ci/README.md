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
