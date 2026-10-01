---
description: Minimal architecture and module boundaries for the current outln runtime.
---

# Architecture

## Architecture goals

- Keep CLI behavior deterministic: same input and flags produce the same outline text.
- Separate parsing, modeling, and rendering so each step is testable in isolation.
- Keep module seams small and explicit to support incremental iteration changes.
- Keep error messaging stable and concise for humans and tooling.
- Migrate incrementally from the current single-file runtime without changing user-visible defaults unless documented.

## Modules and boundaries

- `cli`: parse args, validate inputs, coordinate execution; no language parsing logic.
- `language-engine`: shared contract for language-specific outline generators.
- `language-registry`: resolves which engine handles each file and dispatches generation.
- `languages/typescript`: script-family shared factory/helpers plus TypeScript/JavaScript AST-to-model helpers and outline orchestration.
- `formatter`: model-to-text formatting (`ParsedDeclaration` to output line); nested members rendered with 2-space indentation
- `comments`: shared top-comment extraction for TypeScript/JavaScript, with language-specific comment extraction for Go and Rust.
- Current state:
  - `src/main.ts` — CLI entry and I/O coordination with dependency injection for testability; keeps path/result transformations in pure helpers and routes failure exits through a single error-emission helper
  - `src/core/language-engine.ts` — `OutlineLanguageEngine` interface (`id`, `matchesFilePath`, `generateOutline`, `extractSummary`)
  - `src/core/language-registry.ts` — engine registration + resolution + dispatch for both outline and summary extraction
  - `src/languages/typescript/script-engine.ts` — Shared script engine factory (`createScriptLanguageEngine`) and file-path matcher helper
  - `src/languages/typescript/typescript-engine.ts` — TypeScript engine adapter (extension matching + parser selection for `.ts`/`.tsx` + shared script engine wiring)
  - `src/languages/typescript/javascript-engine.ts` — JavaScript engine adapter (`.js/.jsx/.mjs/.cjs`) using shared script engine wiring
  - `src/languages/markdown/engine.ts` — Markdown engine adapter (frontmatter + heading extraction + frontmatter summary)
  - `src/languages/go/engine.ts` — Go engine adapter (const/var/type/func extraction + header comment summary with build tag exclusion)
  - `src/languages/rust/header-comment.ts` — Rust top-of-file header comment extraction (pure helper for outline and summary paths)
  - `src/languages/rust/engine.ts` — Rust engine adapter (mod/use/type/struct/enum/union/const/static/trait/impl/extern/macro_rules!/fn extraction + delegates header comment extraction)
  - `src/core/types.ts` — Core type definitions (`OutlineOptions`, generic `OutlineResult<TMetadata>` with typed `OutlineMetadata` (`string | Record<string, unknown> | null`), `ParsedDeclaration` with optional `startColumn`/`endColumn` for debug highlighting, `OutlineLine` with optional `span` and `lineNumber`)
  - `src/languages/typescript/comments.ts` — Top-of-file comment extraction (BOM, shebang, blank line handling)
  - `src/languages/typescript/ast-utils.ts` — AST node type constants and checker functions (function, class, variable, ambient, module types)
  - `src/languages/typescript/extractors.ts` — Barrel export for extractor modules
  - `src/languages/typescript/extractors/node-utils.ts` — Line range calculation with decorator support
  - `src/languages/typescript/extractors/signature-builder.ts` — Function signature text construction
  - `src/languages/typescript/extractors/declaration-creators.ts` — Pure factory functions for declarations
  - `src/languages/typescript/extractors/ambient-extractor.ts` — Ambient declaration (`declare ...`) extraction
  - `src/languages/typescript/extractors/namespace-extractor.ts` — Namespace/module extraction
  - `src/languages/typescript/extractors/import-extractor.ts` — Import alias extraction
  - `src/languages/typescript/extractors/function-signature-extractor.ts` — Function overload signature extraction
  - `src/languages/typescript/extractors/class-member-extractor.ts` — Class member extraction (constructor, methods, getters, setters) with computed name filtering and private identifier support
  - `src/core/formatter.ts` — Output formatting: signature-first output with kind/name fallback; nested members rendered with 2-space indentation
  - `src/languages/typescript/outline.ts` — Orchestration: `parseDeclarations()`, `generateOutline()` (~550 lines, reduced from original 915)
  - `src/languages/typescript/class-members.ts` — Class member attachment: `attachClassMembers()` matches class declarations to AST nodes by line range
  - `src/languages/typescript/outline-helpers.ts` — Shared outline utilities: `findExportDeclaration()`, `getExportModifiers()`, `isReExportList()`

## Data flow

1. CLI receives paths and options.
2. IO validates file existence and reads UTF-8 text in the same order as input args.
3. Language registry resolves an engine by file path; returns null for unsupported extensions.
4. CLI handles unsupported extensions by writing `FILE <path> HAS UNSUPPORTED FILE TYPE` to stderr and setting exit code 1.
5. Selected engine parses input and produces an outline result.
   - Markdown engine extracts YAML frontmatter scalars and ATX-style headings (`# ` to `###### `).
   - Go engine extracts const/var/type/func declarations with signatures, handling grouped declarations, multi-name specs, methods with receivers, and generics.
   - Rust engine extracts mod, extern crate, use, type, struct, enum, union, const, static, trait, impl, extern blocks, macro_rules!, and fn declarations with signatures.
6. CLI writes one combined stdout payload, writes one-line stderr messages per failed file, and sets exit code `1` when any failure occurs (otherwise `0`).
7. Debug mode (`--debug` flag): validates single input path (file or directory), generates ANSI-highlighted output via `generateDebugOutput()`; supports TypeScript, JavaScript, Go, Rust, and Markdown (including frontmatter metadata).
   - Directory input: recursively lists regular files (excluding symlinks), sorts lexicographically, processes each file, concatenates outputs with newlines, emits per-file errors to stderr, exits `1` if any errors occur.

## Public interfaces and key types

- `run(args: string[], dependencies?: RunDependencies, processor?: ContentProcessor): Promise<void>`: top-level CLI execution path.
- `RunDependencies`: Injectable I/O and process dependencies for testability.
  - `fileExists`, `isDirectory`, `readTextFile`: filesystem operations
  - `writeOutput`, `writeError`, `setExitCode`: output and process control
  - `globber?: (pattern: string) => Promise<string[]>`: optional glob matching for tests
  - `listFiles?: (dirPath: string) => Promise<string[]>`: optional recursive file listing; skips symlinked directories, returns normalized sorted paths
- `OutlineLanguageEngine`: `{ id, matchesFilePath(filePath), generateOutline(options), extractSummary(content) }`.
  - `extractSummary` returns `{ summary: string | null }` for glob view mode
  - TypeScript: extracts top-of-file comment via `extractTopComment()`
  - Markdown: extracts frontmatter as formatted `key: value, key2: value2` string
- `resolveLanguageEngine(filePath: string): OutlineLanguageEngine | null`: selects the best engine; returns null for unsupported extensions.
- `generateOutlineForFile(options: OutlineOptions): OutlineGenerationResult`: dispatch wrapper returning `{ supported: boolean, result?: OutlineResult, errorMessage?: string }`.
- `extractSummaryFromFile(filePath, content): SummaryExtractionResult`: dispatch wrapper for summary extraction returning `{ supported: boolean, summary?: string | null, errorMessage?: string }`.
- `OutlineResult<TMetadata>`: `{ outline: string, metadata: TMetadata }` with default `OutlineMetadata = string | Record<string, unknown> | null` — rendered output plus language-specific metadata (TypeScript/JavaScript/Go/Rust: top comment string or `null`; Markdown: frontmatter object).
- `ParsedDeclaration`: `{ kind: string, name: string, modifiers: string, signature: string, startLine: number, endLine: number, members?: ParsedDeclaration[], startColumn?: number, endColumn?: number, declaratorLine?: number }`.
  - Recursive `members` array supports nested declarations (for example: class methods, constructors, getters, setters)
  - Members are rendered with 2-space indentation under their parent declaration
  - Optional `startColumn`/`endColumn` (1-based inclusive/exclusive) support debug mode signature highlighting
  - Optional `declaratorLine` (1-based) provides the actual line of each identifier declarator; used for accurate debug highlighting of multi-declarator statements spanning multiple lines
- `OutlineLine`: `{ kind: OutlineLineKind, text: string, span?: OutlineLineSpan, lineNumber?: number }`.
  - Optional `span` with `startColumn`/`endColumn` enables source-to-outline mapping for debug mode
  - Optional `lineNumber` (1-based) for debug mode source highlighting
- `generateDebugOutput(content, outlineResult): string`: generates ANSI-highlighted source output
- `validateDebugInput(args): { valid: true, arg: string } | { valid: false, error: string }`: validates debug mode input constraints; returns discriminated union with validated arg or error
- `parseArguments(args: string[]): ParsedArguments`: extracts `--debug`, `--help`/`-h`, `--version`/`-v`, unknown options and positional paths (everything after `--` is positional)

## Error handling strategy

- Missing input paths write a usage line to stderr and exit with code `1`.
- Missing files write one-line `FILE <path> DOESN'T EXIST` errors and continue processing remaining files.
- Unsupported file types write one-line `FILE <path> HAS UNSUPPORTED FILE TYPE` errors and continue processing remaining files.
- A file that cannot be read or parsed writes `FILE <path> COULD NOT BE READ OR PARSED`; other files in the same run are still outlined.
- Any failure path sets process exit code `1`; success path leaves exit code as `0`.
- Detailed typed error categories are future work and tracked separately from current runtime behavior.

## File layout guidelines

- Keep executable entry in `src/main.ts`.
- Keep language contracts and dispatch in `src/core/language-engine.ts` and `src/core/language-registry.ts`.
- Put language adapters in language-scoped directories (for example: `src/languages/go/engine.ts`, `src/languages/rust/engine.ts`, `src/languages/markdown/engine.ts`, `src/languages/typescript/typescript-engine.ts`).
- Keep `src/languages/` directory-only at top level (`go/`, `rust/`, `markdown/`, `typescript/`).
- Keep shared declaration/output model in `src/core/types.ts`.
- Keep rendering in `src/core/formatter.ts`.
- Mirror boundaries in tests with focused units plus case-based CLI fixtures.
- Keep CLI fixture cases in `__tests__/cases/` using two-section `.case.yaml` format.
