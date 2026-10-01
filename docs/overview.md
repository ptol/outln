---
description: 'Project overview for outln, including current state and initial feature roadmap.'
---

# Overview

## Product

### Goal

- Provide a small CLI that outlines top-level definitions from source files.
- Output only plain text format
- Keep output predictable for both humans and tooling.

### Problem

- Tools often need a fast summary of file structure.
- Raw AST output is usually too large for quick workflows.

### Target users

- Code agents that need quick file-structure context.

### Current functionality

- CLI accepts one or more file paths as arguments.
- Validates file existence and prints missing-file errors to stderr.
- Resolves a language engine per file path, then generates outline output through that engine.
- Includes a built-in TypeScript engine for `.ts`, `.tsx`, `.mts`, `.cts`, and `.d.ts`.
- Includes a built-in JavaScript engine for `.js`, `.jsx`, `.mjs`, and `.cjs`.
- Includes a built-in Markdown engine for `.md` files.
- Includes a built-in Go engine for `.go` files.
- Includes a built-in Rust engine for `.rs` files.
- Unknown extensions are rejected with a clear error message instead of falling back to TypeScript.
- Output format: file path header, optional top comment, then one prefixed line per declaration.
- Declaration line prefix: `[L<start>-L<end>] ` with 1-based inclusive line numbers (e.g., `[L1-L3] interface Person`).
- Supported declarations: `interface`, `type`, `class`, `abstract class`, `function`, `enum`, `const enum`, `const`, `let`, `var`.
- Markdown frontmatter: extracts top-level scalar key/value pairs (strings, numbers, booleans, null) from YAML frontmatter delimited by `---`.
- Markdown headings: extracts ATX-style headings (`# ` through `###### `) with line ranges, skipping headings inside fenced code blocks.
- Extended TypeScript declarations: ambient declarations (`declare function`, `declare class`, `declare const`, `declare global`, `declare module`, `declare namespace`, `declare var`, `declare let`, `declare enum`, `declare interface`, `declare type`), namespace/module blocks (`namespace X {}`, `module Y {}`), exported namespace/module blocks (`export namespace X {}`, `export module Y {}`), TypeScript import aliases (`import Alias = ...`), function overload signatures (ambient and exported).
- Go declarations: `const` (single and grouped), `var` (single and grouped, including multi-name specs like `var x, y = 1, 2`), `type` (single and grouped), `func` (including methods with receivers and generics).
- Go header comment extraction: extracts comments before `package` clause, excludes build tags (`//go:...`, `// +build ...`).
- Rust declarations: `mod`, `extern crate`, `use`, `type`, `struct`, `enum`, `union`, `const`, `static`, `static mut`, `trait`, `impl`, `extern` blocks, `macro_rules!`, `fn` (including async, const, unsafe, generic functions).
- Rust header comment extraction (file mode): extracts only the first contiguous top-of-file regular `//` block after leading blank lines and optional shebang; excludes doc comments (`///`, `//!`) and block comments.
- Preserves `export` and `export default` modifiers in output.
- Splits multi-variable declarations into separate lines sharing the parent statement's line range.
- TypeScript class member extraction: lists constructor, methods, getters, and setters as indented children under their parent class declarations.
- Class member formatting: 2-space indentation with compact signatures (`constructor(params)`, `method(params): returnType`, `get name()`, `set name(params)`).
- Class member filtering: includes private identifiers (e.g., `#touch`), excludes computed names (e.g., `[Symbol.iterator]()`), omits modifiers (static, async, abstract) from output.
- Separates multiple file outputs with exactly one blank line.
- Glob view mode: accepts glob patterns (`*`, `?`, `**`) to emit compact per-file summaries (`<path>: <summary>`) instead of full outlines.
- Glob mode preamble: prints three header lines followed by sorted summary lines (one per matched file).
- Glob mode error handling: empty matches write `No files matched glob patterns: <patterns>` to stderr and exit `1`; unsupported file types in glob results write `FILE <path> HAS UNSUPPORTED FILE TYPE` to stderr and skip stdout.
- Mixed mode detection: mixing glob patterns and file paths writes `Cannot mix glob patterns and file paths in one command.` to stderr and exits `1`.
- Directory input support: directory arguments (ending with `/` or resolving to existing directories) are normalized to `<dir>/**/*` glob patterns before processing.
- Debug mode (`--debug`): outputs source file with ANSI highlighting on header comments and declaration signatures.
- Debug mode supports TypeScript, JavaScript, Go, Rust, and Markdown files with language-specific span mapping.
- Markdown debug highlighting: highlights ATX headings (`#`, `##`, etc.) and YAML frontmatter metadata lines with ANSI escapes, skips headings inside fenced code blocks.
- Debug mode validation: rejects multiple files, glob patterns, or missing input; accepts single file or directory path.
- Debug mode ambient declarations: `declare global` and multi-declarator `declare const`/`let`/`var` statements produce accurate column spans for correct ANSI highlighting of each declarator.
- Debug mode multi-declarator variables: `const a = 1, b = 2` highlights `const a` for first declarator and `b` for subsequent declarators.
- Debug mode anonymous default class: `export default class {}` highlights from `export` through `class` keyword.
- Exits with code `1` if any file is missing, unreadable, or if glob patterns match no files.

## Scope boundaries

### Non-goals

- Producing full AST or syntax tree output.
- Formatting, linting, type-checking, or executing source code.
- Cross-file or whole-project analysis.

## Top comment extraction

- Detects and emits the first top-of-file comment before declaration lines.
- Output order per file: file path, top comment (if any), then declaration lines.
- Skipped preamble before comment detection:
  - UTF-8 BOM (`\uFEFF`)
  - Shebang line (`#!`)
  - Blank lines (whitespace-only)
- Supported comment types:
  - Block comments (`/* ... */`) — captured from opening to closing marker
  - Single-line comments (`//`) — captured as contiguous run of `//` lines
- Preserves exact comment text including markers and original indentation.
- Only the first eligible comment block is extracted; subsequent comments are ignored.
