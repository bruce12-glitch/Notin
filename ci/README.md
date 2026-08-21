# CI workflow staging

`e2e.yml` in this directory is the **WP-DEPLOY-001 GitHub Actions workflow**. It
is staged here rather than at its real path because the Arena coding-agent
GitHub App token does not carry the `workflows` permission, so pushes that
create or modify `.github/workflows/**` are rejected by GitHub:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/e2e.yml` without `workflows` permission
```

## Activate it (one manual step, by a human with repo write access)

```bash
mkdir -p .github/workflows
git mv ci/e2e.yml .github/workflows/e2e.yml
rmdir ci 2>/dev/null || true   # also remove this README
git commit -m "ci: activate E2E workflow"
git push
```

The file needs no edits — it is complete and was validated locally (the backend
hardening release ran it end-to-end: migrations on both drivers, both
fail-closed production smokes, a PostgreSQL rehearsal, and the full Playwright
suite). Once it lands on a branch, GitHub runs it on every `push` and
`pull_request` to `main`.

## What the workflow does

| Step | Purpose |
|---|---|
| `npm ci` (authentication + backend) | Install both workspaces |
| `npm run db:migrate` | Prove migrations apply cleanly |
| `playwright install --with-deps chromium` | The browser for the UI journey |
| Fail-closed smoke (no env) | `NODE_ENV=production` with nothing set must exit non-zero and print `FATAL:` |
| Fail-closed smoke (placeholders) | `.env.example` secrets must be rejected |
| Positive production boot | Real `postgres:16-alpine` service; asserts `/health` reports `"database":"PostgreSQL"` |
| `npm run test:e2e` | Whole `tests/e2e` directory (request + UI specs, both database paths where applicable) |
| Artifacts on failure | `playwright-report/` + `test-results/`, 7-day retention |

Secrets used by the rehearsal are generated in-job with `openssl rand` and are
never printed. The Postgres password is a throwaway literal for a service
container that exists only for the length of the job.
