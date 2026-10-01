---
description: 'Operational guide for running and debugging outln.'
---

# Runbook

## Run CLI locally

```bash
# Run via package script
pnpm start <file.ts>...

# Run directly with tsx
pnpm exec tsx ./src/main.ts <file.ts>...
```

## Run tests

```bash
# Run all tests
pnpm test

# Run lint + typecheck + tests
pnpm run fullcheck
```

- `pnpm run check` runs typecheck and lint only.
- `pnpm run fullcheck` runs typecheck, lint, and tests.
