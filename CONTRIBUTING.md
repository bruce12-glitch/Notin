# Contributing to Notin

Thanks for taking the time to contribute! This guide covers how to get the
project running locally and what we expect from a change before it is merged.

## Project layout

| Directory        | What lives there                                                  |
| ---------------- | ----------------------------------------------------------------- |
| `backend/`       | Express API, Prisma schema, SQL migrations, Playwright E2E suite    |
| `authentication/`| Auth + note-taking app UI (vanilla JS, bundled to `app.bundle.js`)  |
| `frontend/`      | Marketing site                                                      |
| `deploy/`, `ci/` | Deployment manifests and CI helper scripts                          |

## Local setup

Node.js **22.5 or newer** is required (see `engines` in each `package.json`).

```bash
# install dependencies for each workspace you plan to touch
npm --prefix backend install
npm --prefix authentication install
npm --prefix frontend install

# apply migrations (SQLite is used automatically when DATABASE_URL is unset)
npm --prefix backend run db:migrate

# run the API
npm --prefix backend run dev
```

Copy `backend/.env.example` to `backend/.env` before running in a
production-like mode. The server intentionally **refuses to boot** in
production when secrets are missing or still contain the example
placeholders — that is a feature, not a bug.

## Before you open a pull request

Run the same gates CI runs:

```bash
npm --prefix backend run check          # syntax check every source file
npm --prefix authentication run check
npm --prefix authentication run build:app   # bundle must be committed in sync
npm --prefix frontend run check
npm --prefix backend run test:e2e       # Playwright end-to-end suite
```

If you changed anything under `authentication/`, re-run `build:app` and commit
the regenerated `app.bundle.js`. CI fails when the bundle drifts from source.

## Commit and pull request style

- Keep commits focused; one logical change per commit.
- Write imperative subject lines: `add tag filter to note list`, not `added…`.
- Reference the issue you are fixing in the PR description.
- Describe how you verified the change (commands run, browsers checked).
- Never commit secrets, `.env` files, or real user data.

## Reporting bugs and requesting features

Open an issue using the templates in `.github/ISSUE_TEMPLATE/`. For security
issues, please **do not** open a public issue — follow [SECURITY.md](SECURITY.md)
instead.

## Code of conduct

Be respectful and constructive. Review comments should target the code, never
the person who wrote it.
