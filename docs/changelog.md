---
description: 'Changelog of notable changes to the outln project.'
---

# Changelog

## 2026-10-01 — problems-fix-batch: Robustness, gitignore-aware walking and richer TS outlines

- **Fixed**: Files larger than 32 KB no longer fail with `Invalid argument` (tree-sitter `bufferSize` sized to the input via `parseSource()`).
- **Fixed**: One unreadable file no longer hides the outlines of the other files in file mode.
- **Fixed**: Piping into `head` no longer prints an EPIPE stack trace.
- **Fixed**: Existing paths containing `[` (for example `app/[id]/page.tsx`) are treated as literal paths.
- **Fixed**: CRLF files no longer leak `\r` into outlines; UTF-16/binary files report `FILE <path> IS NOT UTF-8 TEXT` instead of an empty outline.
- **Fixed**: `'use client'` / `'use strict'` directives no longer hide the header comment.
- **Added**: `--help`/`-h`, `--version`/`-v`, `--` end-of-options; unknown options are errors.
- **Added**: Gitignore-aware directory walking (per-directory and ancestor `.gitignore` via the `ignore` package); `node_modules`, dot-entries and symlinks are always skipped. Applies to directories, globs and `--debug <dir>`.
- **Added**: Directories/globs and explicit files can be mixed in one command (one-line summary view).
- **Added**: TS/JS outlines show type parameters (`function add<T>(…)`, `class Box<T>`, `type Pair<A, B>`).
- **Added**: TS/JS outlines list re-exports (`export { a as b }`, `export * from`, `export * as ns from`, `export =`, `export default <identifier>`).
- **Added**: Markdown heading ranges cover the whole section; closing hashes (`## Title ##`) are stripped.
- **Changed**: File-mode header comments are printed without comment markers in every language.
- **Changed**: Unsupported files found while walking are skipped silently (exit `0`); explicitly named ones still fail with exit `1`. Files are filtered by extension before being read.
- **Changed**: The glob view banner shows the original arguments instead of expanded patterns.
- **Removed**: `listFiles` dependency (replaced by `readDirectory` + the shared walker).

## 2026-03-01 — 027-support-dir-input-for-debug-mode.md: Debug mode directory input support

- **Added**: `--debug` flag now accepts directory paths for recursive processing.
- **Added**: Directory debug mode enumerates all regular files recursively, sorted lexicographically with normalized path separators.
- **Added**: Per-file error handling in directory debug mode: unsupported types and read/parse failures emit to stderr and continue processing.
- **Added**: Exit code 1 in directory debug mode when any per-file error occurs.
- **Added**: `listFiles` injectable dependency to `RunDependencies` for recursive file listing with symlink exclusion.
- **Changed**: `validateDebugInput` returns discriminated union (`{ valid: true, arg: string } | { valid: false, error: string }`) for type-safe validation.
- **Refactored**: Centralized `normalizeWhitespace` utility in `formatter.ts` to eliminate duplication across Go and Rust engines.

## 2026-02-28 — 026-outline-for-rust-should-outline-top-header-comment.md: Restrict Rust header extraction to the first contiguous top comment block

- **Changed**: Rust header extraction now captures only the first contiguous top-of-file regular `//` comment block.
- **Fixed**: Header extraction stops at the first blank line or other non-regular-comment line instead of scanning farther down the file.
- **Changed**: Rust header extraction consistently excludes doc comments (`///`, `//!`) and block comments (`/* ... */`) in both file outlines and glob summaries.
- **Refactored**: CLI path/result handling was split into pure helpers with centralized failure error emission.

## 2026-02-28 — 025-typescript-function-overload-syntax-should-outline-all-function-signatures.md: Outline exported TypeScript function overload signatures

- **Added**: Exported TypeScript function overload signatures are now outlined (e.g., `export function foo(x: string): string;`).
- **Added**: All overload signatures plus implementation are emitted as separate outline entries in source order.
- **Added**: Test cases for single and multiple exported overload groups.
- **Refactored**: Declaration span API refactored to accept typed params object (`ColumnSpanParams`) for clearer object-style arguments.

## 2026-02-27 — 024-debug-highlight-go-type-aliases.md: Debug highlighting for Go type aliases

- **Fixed**: Go debug mode (`--debug`) now correctly highlights type alias declarations (`type ID = string`).
- **Fixed**: Go debug mode handles grouped type aliases in `type (...)` blocks.
- **Fixed**: Go debug mode handles generic type aliases (`type Set[T comparable] = map[T]bool`).
- **Refactored**: Function signature extraction builds function prefixes in a single child scan to support `async function*` (async + generator modifier).

## 2026-02-27 — 023-incorrect-highlight-members.md: Fix Rust debug spans for multiline where and use declarations

- **Fixed**: Rust debug mode highlighting for multiline `where` clauses now highlights to end of the current line instead of failing.
- **Fixed**: Rust debug mode highlighting for `use` declarations with brace-enclosed imports now correctly prefers semicolon over brace as span end.
- **Added**: Rust function signature item handling (`function_signature_item`) for declarations without body.
- **Refactored**: Extracted shared export column span calculation into helper in `src/outline-helpers.ts`.

## 2026-02-27 — 022-debug-mode-for-markdown-frontmatter: Debug mode for Markdown frontmatter

- **Added**: Debug mode (`--debug`) support for Markdown YAML frontmatter metadata lines with ANSI escapes.
- **Added**: Frontmatter metadata highlighting skips blank lines within the frontmatter block.
- **Refactored**: Extracted shared `getDeclaratorColumnSpan` utility in `src/extractors/node-utils.ts` for consistent column span calculation across declarator types.

## 2026-02-27 — 021-debug-mode-for-markdown-headings: Debug mode for Markdown headings

- **Added**: Debug mode (`--debug`) support for Markdown files, highlighting ATX headings (`#`, `##`, etc.) with ANSI escapes.
- **Added**: Markdown debug mode skips headings inside fenced code blocks to prevent false positives.
- **Added**: Debug mode rejects directory input with clear error message: `--debug requires exactly one input file path.`
- **Refactored**: Centralized class member node type checks in `src/ast-utils.ts` with `CLASS_MEMBER_NODE_TYPES` constant.

## 2026-02-26 — 020-debug-mode-for-rust: Debug mode for Rust files

- **Added**: Debug mode (`--debug`) support for Rust files, highlighting header comments and declaration signatures with ANSI escapes.
- **Added**: Rust debug mode covers `mod`, `use`, `type`, `struct`, `enum`, `union`, `const`, `static`, `trait`, `impl`, `extern`, `macro_rules!`, and `fn` declarations with accurate column spans.
- **Added**: Rust debug mode handles header comments at file start, excluding doc comments (`///`, `//!`) and block comments.
- **Refactored**: Extracted shared `buildBaseDeclaration` helper in `src/extractors/declaration-creators.ts` to reduce duplication in function declaration creation.

## 2026-02-26 — 019-add-debug-mode-for-go-rust-markdown: Debug mode for Go files

- **Added**: Debug mode (`--debug`) support for Go files, highlighting header comments and declaration signatures with ANSI escapes.
- **Added**: Go debug mode covers `const`, `var`, `type`, and `func` declarations with accurate column spans.
- **Added**: Go debug mode handles header comments before `package` clause, excluding build tags.
- **Refactored**: Extracted shared `buildBaseDeclaration` helper in `src/extractors/declaration-creators.ts` to reduce duplication in class, interface, type, and enum declaration creators.

## 2026-02-25 — 016-debug-highlight-const-and-anonymous-default-class: Debug highlight parity for const multi-declarators and anonymous default class

- **Fixed**: Debug mode ANSI highlighting for multi-declarator `const` statements: first declarator includes `const` keyword, subsequent declarators highlight only the identifier.
- **Fixed**: Debug mode ANSI highlighting for anonymous `export default class` declarations: span covers from `export` keyword through `class` keyword.
- **Refactored**: Extracted class member attachment into `src/class-members.ts` and shared export utilities into `src/outline-helpers.ts` to reduce duplication in `src/outline.ts`.
- **Improved**: Column span calculation for variable declarations uses per-declarator positioning for accurate multi-declarator highlighting.

## 2026-02-25 — 015-debug-highlight-ambient-declarations: Debug highlight parity for ambient declarations

- **Fixed**: Debug mode ANSI highlighting for `declare global` declarations now highlights the exact `declare global` keyword span.
- **Fixed**: Debug mode ANSI highlighting for multi-declarator `declare const` statements now highlights each declarator correctly:
  - First declarator span includes `declare const` plus the identifier
  - Subsequent declarator spans include only their identifier
- **Added**: Test coverage for ambient declaration debug output with `const`, `let`, `var`, and `global` forms.
- **Improved**: Column span calculation uses `getDeclarationColumnSpan()` with the ambient_declaration node as `startNode` to include the `declare` keyword.
- **Refactored**: Markdown outline parsing for frontmatter/body separation with code-fence awareness.

## 2026-02-24 — 013-add-debug-flag: Debug mode source highlighting

- **Added**: `--debug` CLI flag that outputs source file with ANSI highlighting on header comments and declaration signatures.
- **Added**: Debug mode input validation: rejects multiple files, directories, glob patterns, or missing input with clear error messages.
- **Added**: Span metadata to `ParsedDeclaration` and `OutlineLine` for source-to-outline mapping (column coordinates for signature highlighting).
- **Added**: ANSI escape sequence highlighting (`\x1b[32m`/`\x1b[0m`) for header comments (full line) and declaration signatures (substring within line).
- **Added**: Span merging logic to handle overlapping or adjacent highlights.

## 2026-02-24 — 012-rust-support: Rust outline support

- **Added**: Built-in Rust engine for `.rs` files extracting mod, extern crate, use, type, struct, enum, union, const, static, trait, impl, extern blocks, macro_rules!, and fn declarations.
- **Changed**: Rust engine recognizes `.rs` file extensions.
- **Added**: Rust function signature extraction with support for async, const, unsafe, visibility modifiers, generics, and where clauses.
- **Added**: Rust impl label generation supporting `impl Trait for Type` and `impl Type` forms.
- **Added**: Rust header comment extraction for glob view summaries, excluding doc comments (`///`, `//!`) and block comments.
- **Added**: Rust shebang handling (`#!`) for header comment extraction.

## 2026-02-24 — 012-javascript-support: JavaScript outline support via shared script engine

- **Added**: Built-in JavaScript language engine for `.js`, `.jsx`, `.mjs`, and `.cjs`.
- **Added**: Shared script engine factory (`src/languages/typescript/script-engine.ts`) so TypeScript and JavaScript reuse the same outline and summary behavior.
- **Changed**: TypeScript engine now selects parser grammar by extension (`typescript` for `.ts/.mts/.cts/.d.ts`, `tsx` for `.tsx`).
- **Changed**: `generateOutline()` now accepts parser dependencies, enabling language engines to inject parser selection without duplicating extraction logic.
- **Added**: Two-section integration tests for JavaScript file mode and glob summary mode.

## 2026-02-23 — 011-go-support: Go outline support

- **Added**: Built-in Go engine for `.go` files extracting const, var, type, and func declarations.
- **Added**: Go const/var extraction with support for single declarations, grouped blocks (`const (...)`), and multi-name specs (`const A, B = 1, 2`).
- **Added**: Go type declaration extraction for single types and grouped type blocks (`type (...)`).
- **Added**: Go function extraction including signatures, methods with receivers, and generics.
- **Added**: Go header comment extraction for glob view summaries, excluding build tags (`//go:...`, `// +build ...`).
- **Added**: Shared comment cleaning utility in `src/comments.ts` for reuse across TypeScript and Go engines.

## 2026-02-23 — 010-class-members-in-outline-output: Class member extraction for TypeScript

- **Added**: TypeScript class member extraction: lists constructor, methods, getters, and setters as indented children under their parent class declarations.
- **Added**: Support for private identifiers (e.g., `#touch()`) in class member names.
- **Added**: Support for abstract methods in abstract classes.
- **Added**: Computed property name filtering (e.g., `[Symbol.iterator]()` is excluded).
- **Added**: Compact member signature formatting: `constructor(params)`, `method(params): returnType`, `get name()`, `set name(params)`.
- **Changed**: Modifiers (static, async, abstract) are omitted from member output for cleaner outlines.
- **Changed**: `ParsedDeclaration` type extended with optional `members` array for nested declarations.
- **Changed**: Formatter renders nested members with 2-space indentation under their parent declaration.

## 2026-02-23 — 009-support-directory-as-input: Directory argument support

- **Added**: Directory arguments are automatically normalized to recursive glob patterns (`<dir>/**/*`).
- **Added**: Directory detection by trailing slash or filesystem check; paths with wildcards are excluded from directory detection.
- **Added**: Mixed mode protection: directory arguments + explicit file paths trigger the same error as glob + file mixing.
- **Added**: Glob view preamble uses normalized patterns, not original directory spellings.

## 2026-02-23 — 008-glob-view: Glob pattern support for repository-scale summaries

- **Added**: Glob view mode: accepts glob patterns (`*`, `?`, `**`) to emit compact per-file summaries (`<path>: <summary>`).
- **Added**: Glob mode preamble: three header lines explaining the output format.
- **Added**: Summary extraction via `extractSummary()` in language engines:
  - TypeScript: extracts and cleans top-of-file comments
  - Markdown: extracts frontmatter as formatted `key: value, key2: value2` string
- **Added**: Mixed mode detection: mixing glob patterns and file paths fails with `Cannot mix glob patterns and file paths in one command.`
- **Added**: Empty glob match handling: writes `No files matched glob patterns: <patterns>` to stderr with exit code 1.
- **Added**: Glob result de-duplication and lexicographic sorting by path.
- **Added**: `glob` package dependency for pattern expansion.
- **Changed**: Extractor module refactored into focused submodules with `src/extractors.ts` as barrel file.

## 2026-02-23 — 007-markdown-support: Markdown file outline support

- **Added**: Built-in Markdown engine for `.md` files extracting YAML frontmatter and ATX-style headings.
- **Added**: Frontmatter parsing: top-level scalar key/value pairs (strings, numbers, booleans, null) emitted before headings.
- **Added**: Heading extraction with line ranges `[L<n>-L<n>]` for `# ` through `###### `, skipping headings inside fenced code blocks.
- **Added**: Handles unterminated frontmatter by treating content as regular text for heading scanning.
- **Added**: CRLF line ending normalization in Markdown frontmatter parsing.
- **Changed**: Unknown file extensions are rejected with `FILE <path> HAS UNSUPPORTED FILE TYPE` instead of falling back to TypeScript.
- **Added**: ADR-005 documenting the generic `metadata: unknown` type for multi-language result objects.

## 2026-02-23 — 007-multilanguage-foundation: Language engine registry refactor

- **Added**: `OutlineLanguageEngine` contract for pluggable language-specific outline generation.
- **Added**: `src/language-registry.ts` for engine resolution and per-file dispatch.
- **Added**: TypeScript engine adapter in `src/languages/typescript/typescript-engine.ts` with extension matching.
- **Changed**: CLI processing now routes through language registry instead of directly calling TypeScript outline generation.
- **Changed**: `ParsedDeclaration.kind` switched from strict union to `string` for cross-language extensibility.
- **Changed**: Formatter now emits `signature` when present, with generic `kind + name` fallback.
- **Added**: Tests for engine resolution, fallback behavior, and dispatch path.

## 2026-02-23 — 006-support-typescript-cases: Additional ambient and exported declarations

- **Added**: Support for additional ambient declarations (`declare namespace`, `declare var`, `declare let`, `declare enum`, `declare interface`, `declare type`).
- **Added**: Support for exported namespace and module blocks (`export namespace X {}`, `export module Y {}`).
- **Added**: Support for `declare abstract class` ambient declarations.
- **Refactored**: Simplified ambient declaration extraction with shared helpers and declaration kind map.

## 2026-02-22 — 005-support-typescript-cases: Extended TypeScript declaration forms

- **Added**: Support for ambient declarations (`declare function`, `declare class`, `declare const`, `declare global`, `declare module`).
- **Added**: Support for namespace and module blocks (`namespace X {}`, `module Y {}`).
- **Added**: Support for TypeScript import aliases (`import Alias = require('...')`, `import Alias = ns.member`).
- **Added**: Support for function overload signatures (declaration-only signatures without body).
- **Added**: `DeclarationKind` strict union type for type-safe declaration kind handling.
- **Refactored**: Split `src/outline.ts` into focused modules: `ast-utils.ts`, `extractors.ts`, `formatter.ts`.

## 2026-02-22 — 004-support-these-typescript-cases: Additional TypeScript declaration forms

- **Added**: Support for `export abstract class` with correct kind preservation.
- **Added**: Support for `export const enum` with `const` keyword preserved in output.
- **Added**: Support for anonymous `export default class {}` emitting `export default class` (no trailing whitespace).
- **Added**: Explicit test coverage for `export type` aliases.
- **Added**: Generator function formatting verified: `function*` and `async function*` with no space before `*`.
- **Added**: Multi-declarator `const` declarations split into separate lines per declarator.

## 2026-02-22 — 004-esmoduleinterop-tree-sitter-imports: Standard ESM imports for parser dependencies

- **Changed**: Enabled `esModuleInterop: true` in `tsconfig.json`.
- **Changed**: Replaced `import = require()` usage in `src/outline.ts` with standard default imports.
- **Removed**: Local eslint suppressions for `@typescript-eslint/no-require-imports` in parser imports.
- **Docs**: Updated `docs/til.md` to capture the new interop approach.

## 2026-02-21 — 002-include-top-comment-in-output: Top comment extraction

- **Added**: Extract and emit first top-of-file comment in outline output.
- **Added**: Support for block comments (`/* ... */`) and single-line comment runs (`//`).
- **Added**: Preamble skipping: UTF-8 BOM, shebang lines (`#!`), and blank lines.
- **Added**: `OutlineResult` interface returning both outline and extracted metadata.
- **Output order**: File path → top comment (if any) → declaration lines.

## 2026-02-22 — 003-add-line-range-before-definitions: Declaration line ranges

- **Added**: Line range prefixes `[L<start>-L<end>]` for all declarations (1-based inclusive line numbers).
- **Added**: Decorator-aware line range calculation (decorators included in declaration start line).
- **Added**: Multi-declarator variable declarations share the parent statement's line range.
- **Refactored**: Extracted `src/types.ts` (core interfaces) and `src/comments.ts` (top-comment extraction) from `src/outline.ts`.
- **Added**: `ParseDependencies` interface for testable parser injection.

## 2026-02-21 — 001-outline-extraction: Outline extraction for TypeScript

- **Added**: Tree-sitter-based TypeScript outline parsing.
- **Added**: Top-level declaration extraction (interface, type, class, function, enum, const, let, var).
- **Added**: Preservation of `export` and `export default` modifiers in output.
- **Added**: Multi-variable declaration splitting into separate outline lines.
- **Added**: Support for generator functions (`function*`) and abstract classes.
- **Added**: Proper handling of re-export lists (`export { ... } from`) — skipped as non-declarations.
- **Output format**: File path header followed by one line per declaration.
