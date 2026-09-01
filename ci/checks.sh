#!/usr/bin/env bash
# Fast pre-push gate — the same checks CI runs, minus the Playwright suite.
# Usage: ./ci/checks.sh   (run from the repository root)

set -euo pipefail

cd "$(dirname "$0")/.."

fail=0
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
bad() { printf '\033[31mFAIL: %s\033[0m\n' "$1"; fail=1; }

step "Backend syntax"
npm --prefix backend run --silent check || bad "backend syntax check"

step "Authentication syntax"
npm --prefix authentication run --silent check || bad "authentication syntax check"

step "Frontend syntax"
npm --prefix frontend run --silent check || bad "frontend syntax check"

step "Browser bundle is in sync with source"
npm --prefix authentication run --silent build:app || bad "bundle build"
git diff --quiet -- authentication/app.bundle.js ||
  bad "authentication/app.bundle.js is stale — commit the rebuilt bundle"

step "No tracked .env files"
if git ls-files | grep -E '(^|/)\.env(\..*)?$' | grep -v '\.env\.example$'; then
  bad "a .env file is tracked in git — remove it and rotate the secrets"
else
  echo "OK: no tracked .env files"
fi

if [ "$fail" -ne 0 ]; then
  printf '\n\033[31mSome checks failed.\033[0m\n'
  exit 1
fi

printf '\n\033[32mAll quick checks passed.\033[0m Run "npm --prefix backend run test:e2e" for the full suite.\n'
