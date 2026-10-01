---
description: 'Operational guide for running and debugging outln, including directory/glob input rules.'
---

# Runbook

## Run CLI locally

```bash
# Run via package script
pnpm start <file.ts>...

# Run directly with tsx
pnpm exec tsx ./src/main.ts <file.ts>...

# Help and version
pnpm exec tsx ./src/main.ts --help
pnpm exec tsx ./src/main.ts --version
```

- Quote glob arguments (`"src/**/*.ts"`) so the shell does not expand them. `npx` runs commands through a shell that re-expands
  glob characters in arguments, so prefer `pnpm exec` or `node_modules/.bin/tsx` when
  testing paths that contain `[` or `*`.
- Paths after `--` are always treated as paths, even if they start with `-`.

## Directory and glob inputs

- Directory and glob inputs honor `.gitignore` files: each directory's own `.gitignore` plus
  ancestor `.gitignore` files up to the nearest directory containing `.git`. Outside a git
  repository, only `.gitignore` files inside the target apply.
- `node_modules`, dot-entries (files and directories starting with `.`) and symlinks are always skipped.
- An explicitly named directory is always walked, even when an ancestor `.gitignore` ignores it.
- Global git excludes (`core.excludesFile`) and `.git/info/exclude` are not read.
- Files that are not supported are skipped silently; explicitly named unsupported files are errors.

## Debug output problems

- `FILE <path> IS NOT UTF-8 TEXT`: the file contains NUL bytes (UTF-16 or binary). Convert it to UTF-8.
- `FILE <path> COULD NOT BE READ OR PARSED`: the read failed (permissions, file vanished) or the parser threw.
- Use `outln --debug <file>` to see which source spans produced each outline line.

## Run tests

```bash
# Run all tests
pnpm test

# Run lint + typecheck + tests
pnpm run fullcheck
```

- `pnpm run check` runs typecheck and lint only.
- `pnpm run fullcheck` runs typecheck, lint, and tests.
