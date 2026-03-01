#!/usr/bin/env bash
# Runs the CI verification sequence before allowing release publication.
set -euo pipefail

pnpm install --frozen-lockfile
pnpm run typecheck
pnpm exec eslint . --max-warnings=0
pnpm test
pnpm run build
npm pack --dry-run
