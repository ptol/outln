---
description: 'Manual validation checklist for outln CLI.'
---

# Human Validation

## Setup

```bash
# Install dependencies
pnpm install

# Build (if needed)
pnpm run build
```

## Debug Mode with Directory Input

### Happy Path: Recursive directory processing

**Steps:**

```bash
# Create test directory structure
mkdir -p /tmp/test-pkg/nested

echo 'export const aFirst = 1;' > /tmp/test-pkg/a-first.ts
echo 'export const zLast = 3;' > /tmp/test-pkg/z-last.ts
echo 'export const middle = 2;' > /tmp/test-pkg/nested/middle.ts

# Run debug mode on directory
pnpm exec tsx ./src/main.ts --debug /tmp/test-pkg
```

**Expected Results:**

- Output shows files processed in lexicographic order (a-first.ts, nested/middle.ts, z-last.ts)
- Each file's source is displayed with ANSI highlighting on declarations
- Files separated by newlines
- Exit code 0

**Critical Checkpoints:**

- [ ] Files are sorted alphabetically regardless of filesystem order
- [ ] Path separators are normalized to `/`
- [ ] Each declaration line shows green ANSI highlighting (`\x1b[32m`)
- [ ] No error messages in stderr

### Error Handling: Unsupported file types in directory

**Steps:**

```bash
mkdir -p /tmp/test-mixed
echo 'export const a = 1;' > /tmp/test-mixed/a.ts
echo 'plain text' > /tmp/test-mixed/readme.txt

pnpm exec tsx ./src/main.ts --debug /tmp/test-mixed
```

**Expected Results:**

- stdout shows highlighted content for `a.ts`
- stderr shows: `FILE /tmp/test-mixed/readme.txt HAS UNSUPPORTED FILE TYPE`
- Exit code 1

**Critical Checkpoints:**

- [ ] Processing continues after unsupported file error
- [ ] Per-file error appears in stderr, not stdout
- [ ] Exit code indicates failure despite successful files

### Validation: Multiple arguments rejected

**Steps:**

```bash
pnpm exec tsx ./src/main.ts --debug /tmp/test-pkg /tmp/test-mixed
```

**Expected Results:**

- stderr shows: `--debug requires exactly one input file path.`
- Exit code 1
- No output to stdout

**Critical Checkpoints:**

- [ ] Clear error message about single argument requirement
- [ ] No partial processing occurs

### Validation: Empty directory

**Steps:**

```bash
mkdir -p /tmp/test-empty
pnpm exec tsx ./src/main.ts --debug /tmp/test-empty
```

**Expected Results:**

- No output to stdout (no files to process)
- Exit code 0
- No error messages

**Critical Checkpoints:**

- [ ] Empty directory handled gracefully
- [ ] No errors emitted for lack of files
