---
description: Reference for writing and validating two-section .case.yaml tests.
---

# Two-Section Testing

## Purpose

- Define CLI test inputs and expected output channels in one `.case.yaml` file.
- Keep fixtures in `__tests__/cases/`.
- Use one `.case.yaml` file per behavior.
- Add focused unit tests for pure helper modules when behavior is easier to verify without CLI orchestration.

## File Format

- Use YAML format in each `.case.yaml` file.
- Add `args:` as a YAML list of CLI arguments.
- Add one or more fixture files as keys ending in `.txt` (or the needed filename).
- Add expected channels with `stdout:` and/or `stderr:` using block scalars.
- Keep multiline content indented under `|`.

```yaml
args:
  - input/a.txt
  - input/b.txt
input/a.txt: |
  Hello A
input/b.txt: |
  Hello B
stdout: |
  Hello A
  Hello B
```

## Examples

### Stderr Only

```yaml
args:
  - input/invalid.ts
input/invalid.ts: |
  bad syntax
stderr: Unexpected token: "bad"
```

### Stdout And Stderr

```yaml
args:
  - alpha.txt
  - alpha2.txt
alpha.txt: |
  Hello from alpha.
  line 2
  line 3
stdout: |
  Hello from alpha.
  line 2
  line 3
stderr: FILE alpha2.txt DOESN'T EXIST
```

### ANSI Escape Sequences (Debug Mode)

When testing debug mode output with ANSI color codes, use double-quoted strings instead of block scalars:

```yaml
args:
  - --debug
  - input/sample.ts
input/sample.ts: |
  // Header
  const x = 1;
stdout: "\e[32m// Header\e[0m\n\n\e[32mconst x\e[0m = 1;\n"
```

- Use `\e` or `\x1b` for escape character
- The test runner's `decodeFixtureEscapes` converts `\x1b` to actual escape bytes
- Block scalars (`|`) will NOT interpret escape sequences

## Rules

- `args:` is required and must be a YAML list.
- Define at least one fixture file key.
- File keys must map to string content.
- Use `stdout:` and/or `stderr:` for expected output.
- Use block scalars (`|`) for multiline fixture or expected content.
- Newlines are significant in fixture and expected output sections.
- For iteration-scoped case files, use `__tests__/cases/<iteration-id>-<behavior-slug>.case.yaml`.

## Error Case Testing

- Error cases (e.g., file not found) must still define at least one fixture file.
- Include a valid file in `args` alongside the missing file to satisfy the fixture requirement.
- Expected stderr output is defined with the `stderr:` key.

## Run

- Run all `.case.yaml` tests:

```bash
pnpm test
```

- Run full validation before handoff when parser or renderer behavior changes:

```bash
pnpm run fullcheck
```

- `fullcheck` is the required guard against regressions between iteration-focused tests and legacy cross-language fixture expectations.

## Unit Test Guidance

- Use direct Vitest unit tests for pure extraction/formatting helpers that do not require virtual filesystem setup.
- Keep unit tests in `__tests__/*.test.ts` and assert exact return shapes for deterministic behavior.
- Use two-section case tests for CLI integration behavior, argument handling, and full rendered output.
- Add at least one end-to-end workflow test per iteration in `__tests__/` and group assertions into `happy path`, `edge cases`, and `error cases` when applicable.
