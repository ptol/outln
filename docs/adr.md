---
description: Architecture Decision Records for outln.
---

# Architecture Decision Records

## ADR-001: Use Result Object Pattern for Outline Generation

**Status**: Superseded by ADR-005  
**Context**: Preparing codebase for iteration 002 (include top comment in output)

### Decision

Change `generateOutline()` return type from `string` to `OutlineResult` object containing both the rendered outline and extracted metadata.

```typescript
interface OutlineResult {
  outline: string; // Rendered output
  topComment: string | null; // Extracted metadata
}
```

### Rationale

- Enables analyzer/renderer separation per target architecture (see `architecture.md`)
- Allows `generateOutline` to return multiple computed values without breaking the renderer contract
- Maintains backward compatibility via destructuring: `result.outline`
- Supports future extensions (additional metadata fields) without changing function signatures

### Consequences

- **Positive**: Clean separation between parsing/analysis and rendering phases
- **Positive**: Type-safe evolution of analyzer output
- **Negative**: Small increase in API surface (one interface per result type)

### Related

- `architecture.md`: Modules and boundaries, Data flow sections
- `src/outline.ts`: `OutlineResult` interface, `generateOutline()` implementation

## ADR-002: Use DeclarationKind Union Type for Type-Safe Declaration Kinds

**Status**: Superseded by ADR-004  
**Context**: Extending outline coverage to support TypeScript ambient declarations, namespaces, import aliases, and function overloads (iteration 005).

### Decision

Change `ParsedDeclaration.kind` from `string` to a strict union type `DeclarationKind` enumerating all valid declaration kinds.

```typescript
export type DeclarationKind =
  | 'interface'
  | 'type'
  | 'class'
  | 'function'
  | 'enum'
  | 'const enum'
  | 'const'
  | 'let'
  | 'var'
  | 'abstract class'
  | 'declare function'
  | 'declare class'
  | 'declare const'
  | 'declare global'
  | 'declare module'
  | 'namespace'
  | 'module'
  | 'import';

export interface ParsedDeclaration {
  kind: DeclarationKind;
  // ... other fields
}
```

### Rationale

- TypeScript enforces exhaustiveness in switch statements and type guards
- Prevents typos in declaration kind strings at compile time
- Makes the complete set of supported declarations discoverable via type definitions
- Future declaration kinds require explicit extension of the union, preventing accidental additions

### Consequences

- **Positive**: Compile-time safety for declaration kind handling; explicit inventory of supported forms
- **Positive**: IDE autocomplete shows all valid declaration kinds when writing handlers
- **Negative**: Adding new declaration kinds requires editing both the union type and the implementation
- **Migration**: Existing string-based comparisons continue to work due to TypeScript structural typing
- **Superseded note**: This decision was replaced when the codebase shifted to language engines and open-ended declaration kinds to reduce cross-language friction.

### Related

- `src/types.ts`: `DeclarationKind` union, `ParsedDeclaration` interface
- `src/outline.ts`: Declaration parsing and formatting logic

## ADR-003: Extend DeclarationKind for Additional Ambient and Export Forms

**Status**: Superseded by ADR-004  
**Context**: Adding support for missing TypeScript declaration forms (iteration 006).

### Decision

Extend the `DeclarationKind` union type with new ambient declaration forms and exported namespace/module blocks.

```typescript
export type DeclarationKind =
  // ... existing kinds ...
  // Additional ambient declarations
  | 'declare namespace'
  | 'declare var'
  | 'declare let'
  | 'declare enum'
  | 'declare interface'
  | 'declare type';
// Exported namespace/module blocks handled via existing 'namespace' and 'module' kinds
// with 'export' modifier preserved in output
```

### Rationale

- Builds on ADR-002's union type approach for type-safe declaration handling
- Keeps the kind namespace flat while supporting nested modifier combinations (`export` + `namespace`)
- Modifiers (`export`, `default`) are tracked separately from the base declaration kind
- Allows the formatter to reconstruct output like `export namespace API` from kind + modifiers

### Consequences

- **Positive**: Consistent with existing kind+modifier pattern; no breaking changes to formatter logic
- **Positive**: Complete coverage of common ambient declaration forms and exported namespace/module blocks
- **Negative**: Does not expand members inside namespace/module blocks (intentional non-goal)
- **Superseded note**: The strict union extension strategy was replaced by language-specific kinds represented as strings.

### Related

- `src/types.ts`: Extended `DeclarationKind` union
- `src/extractors.ts`: `extractAmbientDeclaration()` with new form handling
- `src/outline.ts`: `processExportStatement()` with namespace/module block detection

## ADR-004: Use Language Engine Registry with Open Declaration Kinds

**Status**: Accepted  
**Context**: Preparing the runtime to support many languages without frequent edits to shared core types.

### Decision

- Introduce a language-engine interface with:
  - stable language `id`
  - path-based matching (`matchesFilePath`)
  - generation entrypoint (`generateOutline`)
- Add a central language registry that resolves an engine per input file and dispatches outline generation.
- Keep a deterministic fallback engine (currently TypeScript) for unknown extensions.
- Change `ParsedDeclaration.kind` to `string` so each language can emit its own kind vocabulary.
- Make formatter logic signature-first: if `signature` is present, render it directly; otherwise render `kind` + `name`.

### Rationale

- Strict global unions for declaration kinds become a maintenance bottleneck as language count grows.
- Engine registration isolates per-language behavior and avoids cross-cutting edits in CLI orchestration.
- A resolver makes language support incremental: new engine files can be added with minimal changes.
- Signature-first formatting keeps shared rendering generic across language syntaxes.

### Consequences

- **Positive**: Lower cost to add new languages and declaration kinds.
- **Positive**: Cleaner separation between CLI orchestration and language parsing details.
- **Negative**: Less compile-time exhaustiveness over declaration kinds in shared code.
- **Follow-up**: Fallback-to-TypeScript behavior for unknown extensions was removed (see `docs/techdebt.md`); unsupported extensions now produce explicit errors.

### Related

- `src/language-engine.ts`: engine interface contract
- `src/language-registry.ts`: registration, resolution, and dispatch
- `src/languages/typescript/typescript-engine.ts`: first engine implementation
- `src/types.ts`: `DeclarationKind` changed to `string`
- `src/formatter.ts`: signature-first output strategy

## ADR-005: Use Generic Metadata Type for Multi-Language Result Objects

**Status**: Accepted  
**Context**: Preparing codebase for iteration 007 (Markdown support) with language-specific metadata needs

### Decision

Change `OutlineResult` from `topComment: string | null` to `metadata: unknown` to support heterogeneous metadata types across language engines.

```typescript
interface OutlineResult {
  outline: string; // Rendered output
  metadata: unknown; // Language-specific extracted metadata
}
```

### Rationale

- TypeScript extracts a top-of-file comment string; Markdown extracts a YAML frontmatter object; future languages may extract different structures
- `unknown` allows each engine to return its own metadata shape without forcing a shared schema
- Keeps the engine interface minimal: engines produce metadata, CLI rendering decides how to display it
- Avoids union type explosion (`string | Record<string, unknown> | ...`) as language count grows

### Consequences

- **Positive**: Language engines remain decoupled; no shared metadata schema required
- **Positive**: Type-safe per-engine: engines cast `unknown` to their expected shape internally
- **Negative**: Consumers must narrow `unknown` before using metadata; no IDE autocomplete for cross-engine metadata
- **Migration**: Existing TypeScript engine returns top comment string as `metadata`; rendering logic checks `typeof metadata === 'string'`

### Related

- `src/types.ts`: `OutlineResult` interface with `metadata: unknown`
- `src/outline.ts`: TypeScript engine returns top comment via `metadata`
- `docs/adr.md`: ADR-001 (superseded) originally introduced the result object pattern

## ADR-006: Add Optional Span Coordinates for Debug Mode Source Highlighting

**Status**: Accepted  
**Context**: Preparing codebase for iteration 013 (debug flag) requiring source-to-outline span mapping

### Decision

Extend `ParsedDeclaration` and `OutlineLine` with optional column coordinates to support ANSI source highlighting:

```typescript
interface ParsedDeclaration {
  // ... existing fields ...
  /** Start column (1-based inclusive) for signature text within startLine */
  startColumn?: number;
  /** End column (1-based exclusive) for signature text within startLine */
  endColumn?: number;
}

interface OutlineLineSpan {
  startColumn: number; // 1-based inclusive
  endColumn: number; // 1-based exclusive
}

interface OutlineLine {
  kind: OutlineLineKind;
  text: string;
  span?: OutlineLineSpan; // Enables source highlighting
}
```

Add `parseArguments()` to CLI for flag extraction before path processing.

### Rationale

- Debug mode requires mapping outline entries back to exact source spans for accurate ANSI highlighting
- Column coordinates follow same 1-based convention as line numbers for consistency
- Optional fields preserve backward compatibility; existing engines work without changes
- `startColumn`/`endColumn` on declarations enable signature-only highlighting (not full line)
- `span` on `OutlineLine` decouples rendering text from source location metadata
- Separate `debug-mode.ts` module keeps ANSI logic isolated from core outline generation

### Consequences

- **Positive**: Debug mode can highlight exact declaration signatures and header comments
- **Positive**: Optional fields allow incremental adoption across language engines
- **Positive**: CLI flag extraction (`--debug`) is testable via `parseArguments()`
- **Negative**: Language engines must populate column coordinates for accurate debug output
- **Note**: Span merging for overlapping highlights handled in `debug-mode.ts`

### Related

- `src/types.ts`: `ParsedDeclaration`, `OutlineLine`, `OutlineLineSpan` interfaces
- `src/debug/debug-mode.ts`: ANSI highlighting, span merging, debug output generation
- `src/main.ts`: `parseArguments()`, `runDebugMode()` stub
- `iterations/013-add-debug-flag.md`: Debug mode specification
