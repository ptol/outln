# outln

CLI to print concise file outlines for source files.

You can read about this cli here: [https://blog.fooqux.com/blog/outline-oriented-codebase/](https://blog.fooqux.com/blog/outline-oriented-codebase/)

## Install

```bash
npm i -g outln
```

## Usage

```bash
outln <file-path> [file-path...]
```

### File mode

Generate full outlines for one or more files:

```bash
outln src/main.ts
outln src/main.ts src/core/formatter.ts
```

Header comments are printed without comment markers. Markdown headings show the line range of
their whole section, so a single section can be read directly.

### Glob mode

Generate compact one-line summaries per matching file:

```bash
outln src
outln "src/**/*.ts"
outln "src/**/*.{ts,tsx,js}"
outln docs AGENTS.md
```

- `.gitignore` files are respected (including ancestor `.gitignore` files up to the git root).
- `node_modules`, dot-entries and symlinks are always skipped.
- Unsupported file types are skipped silently.
- Explicit files can be mixed with directories and globs; they are listed in the same format.
- Existing paths are always literal, so `outln "app/[id]/page.tsx"` works.

### Debug mode

Show source text with ANSI highlighting for extracted outline:

```bash
outln --debug src/main.ts
outln --debug src
```

## Supported file types

- TypeScript: `.ts`, `.tsx`, `.mts`, `.cts`, `.d.ts`
- JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs`
- Markdown: `.md`
- Go: `.go`
- Rust: `.rs`
- Java: `.java`
- Kotlin: `.kt`, `.kts`
- C#: `.cs`
