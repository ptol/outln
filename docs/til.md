---
description: Reusable engineering learnings and gotchas for the outln project.
---

# Today I Learned

## ANSI Escape Codes in YAML Test Fixtures

- **Context**: Two-section `.case.yaml` tests that assert ANSI escape sequences require literal string representation.
- **Pattern**: Use literal `\x1b` (four characters: backslash, x, 1, b) in expected output, not the actual escape character:
  ```yaml
  stdout: |
    \x1b[32m// highlighted comment\x1b[0m
    \x1b[32mexport const foo\x1b[0m = 1;
  ```
- **Implementation**: Store ANSI codes as literal strings in source:
  ```typescript
  const ANSI_GREEN = '\\x1b[32m';
  const ANSI_RESET = '\\x1b[0m';
  ```
- **Rationale**: YAML block scalars preserve literal backslash sequences; actual escape characters may be interpreted by terminals or test runners.

## Tree-sitter ESM Interop Imports

- **Context**: tree-sitter language packages export differently than typical ESM packages.
- **Import pattern**:
  ```typescript
  import Parser from 'tree-sitter';
  import Go from 'tree-sitter-go';
  ```
- **Setup**:
  ```typescript
  const parser = new Parser();
  parser.setLanguage(Go);
  ```
- **Note**: Use default imports, not namespace imports, for tree-sitter language packages.

## Tree-sitter TypeScript AST Node Types for Outline Extraction

- **Top-level declaration nodes**: `function_declaration`, `class_declaration`, `abstract_class_declaration`, `interface_declaration`, `type_alias_declaration`, `enum_declaration`, `const_enum_declaration`, `lexical_declaration` (const/let), `variable_declaration` (var)
- **Module/namespace nodes**: `internal_module` (namespace), `module` (module)
- **Ambient declaration nodes**: `ambient_declaration` (wraps declare statements)
- **Export node**: `export_statement` (has `declaration` field or children)
- **Import nodes**: `import_statement`, `import_alias`
- **Comment node**: `comment` — skip during outline extraction

## TypeScript-Specific AST Node Types for Advanced Constructs

- **Import alias**: `import_alias` node with `import_require_clause` child for `import X = require('...')` syntax
- **Function overloads**: `function_signature` node type for ambient function signatures without body
- **Exported function overloads**: `function_signature` inside `export_statement` (not wrapped in `ambient_declaration`); handle in `findExportDeclaration` and `convertNodeToDeclaration` to preserve modifiers
- **Ambient forms**: `ambient_declaration` wraps `function_signature`, `class_declaration`, `interface_declaration`, `type_alias_declaration`, `enum_declaration`, `variable_declaration`, `lexical_declaration`, `abstract_class_declaration`
- **Internal module**: `internal_module` represents `namespace` keyword; `module` represents `module` keyword
- **Expression statement namespaces**: `expression_statement` containing `internal_module` child for namespace declarations

## AST Node Structures for Ambient Declarations

- **Ambient wrapper**: `ambient_declaration` node containing the actual declaration as child
- **Ambient function**: contains `function_signature` (not `function_declaration`)
- **Ambient class**: contains `class_declaration` or `abstract_class_declaration`
- **Ambient variable**: contains `variable_declaration` (var) or `lexical_declaration` (const/let)
- **Ambient type/interface/enum**: contains corresponding declaration node
- **Name extraction**: use `childForFieldName('name')` on the inner declaration node, not the ambient wrapper

## AST Node Structures for Exported Namespace/Module Declarations

- **Export statement**: `export_statement` node with `internal_module` or `module` as declaration field
- **Name location**: `internal_module.childForFieldName('name')` or `module.childForFieldName('name')`
- **Kind preservation**: use `'namespace'` for `internal_module`, `'module'` for `module` to match source keyword

## Refactoring AST Node Dispatch in Outline Extraction

- **Context**: Centralize node type checking to avoid duplication.
- **Pattern**: Create type guard functions using `ReadonlySet` for O(1) lookups:
  ```typescript
  const FUNCTION_NODE_TYPES = new Set(['function_declaration', 'function_signature', ...]);
  export function isFunctionNodeType(type: string): boolean {
    return FUNCTION_NODE_TYPES.has(type);
  }
  ```
- **Declaration kind mapping**: Map node types to declaration kinds in a single function:
  ```typescript
  export function getDeclarationKind(nodeType: string): DeclarationKind {
    switch (nodeType) {
      case 'function_declaration':
        return 'function';
      case 'class_declaration':
        return 'class';
      // ... etc
    }
  }
  ```
- **Benefits**: Single source of truth for node type classification; easier to add new node types.

## Line Range Extraction from Tree-sitter Nodes

- **Basic line range**: `startPosition.row + 1` for 1-based line numbers
- **Inclusive end line**: `endPosition.row + 1` (tree-sitter uses 0-based inclusive indices)
- **Decorator handling**: For decorated declarations, use the decorator's start position as `startLine`
- **Export statement handling**: When a declaration is inside an export statement, use the export statement's line range for the declaration
- **Signature-only extraction**: For function overloads, extract just the signature without body

## Decorator Line Range Handling for Export Statements

- **Context**: Decorators attached to exported declarations appear as children of the export statement, not the declaration.
- **AST structure**: `export_statement` has `decorator` children followed by the declaration
- **Pattern to find decorators**:
  ```typescript
  const decorators = node.children.filter((child) => child.type === 'decorator');
  const lastDecorator = decorators[decorators.length - 1];
  ```
- **Line range calculation**:
  ```typescript
  const startLine = (lastDecorator ?? declaration).startPosition.row + 1;
  const endLine = declaration.endPosition.row + 1;
  ```
- **Rationale**: Decorators syntactically precede the declaration and should be included in its line range.

## Declaration Name Extraction and Variable Declaration Handling

- **Context**: Variable declarations (`const`, `let`, `var`) can have multiple declarators in one statement.
- **Multi-declarator handling**: Each `variable_declarator` child has its own `name` field; emit one declaration per declarator
- **Line range consistency**: All declarators in a single statement share the parent's line range
- **Per-declarator line tracking**: For debug mode highlighting of multiline statements, capture `nameNode.startPosition.row + 1` as `declaratorLine` on each `ParsedDeclaration`
- **Line number fallback**: Use `declaratorLine ?? startLine` when building outline lines; first declarator has same line as statement, subsequent declarators may differ
- **Name node access**: Use `childForFieldName('name')` on the declarator, not the parent declaration
- **Variable kind detection**: For `lexical_declaration`, inspect children for `const` or `let` keywords

## Anonymous Declaration AST Node Types

- **Context**: Anonymous classes and functions have different AST node types than named declarations.
- **Named class**: `class_declaration` with `name` field
- **Anonymous class expression**: `class` node type (different from `class_declaration`)
- **Named function**: `function_declaration` with `name` field
- **Anonymous function**: `function` node type without name (not currently handled in outline)
- **Default export anonymous class**: `export_statement` with `class` child (not `class_declaration`)
- **Detection pattern**: Check node type and presence of `name` field; `class` type indicates anonymous class expression

## Node Type Guards with Set Membership

- **Context**: Efficiently categorize AST node types without repetitive switch statements.
- **Pattern**: Define readonly sets for each category:
  ```typescript
  const TOP_LEVEL_DECLARATION_TYPES = new Set([
    'function_declaration',
    'function_signature',
    'class_declaration',
    'abstract_class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'const_enum_declaration',
    'lexical_declaration',
    'variable_declaration',
    'import_alias',
    'internal_module',
    'module'
  ]);
  ```
- **Type guards**:
  ```typescript
  export function isTopLevelDeclaration(node: SyntaxNode): boolean {
    return TOP_LEVEL_DECLARATION_TYPES.has(node.type);
  }
  ```
- **Benefits**: O(1) lookup, centralized node type definitions, easy to extend.

## Minimal YAML Scalar Parser for Frontmatter

- **Context**: Markdown frontmatter needs lightweight YAML parsing without full library.
- **Supported scalars**: strings (quoted/unquoted), numbers, booleans, null
- **Quote handling**: Single or double quotes → extract inner content
- **Special values**: `true`, `false`, `null`, `~` (YAML null), empty string
- **Number detection**: `/^-?\d+(\.\d+)?$/`
- **Unquoted strings**: JSON stringify to ensure valid output
- **Limitation**: Only top-level key-value pairs; no nested objects/arrays

## Cleaning JSDoc/Block Comments for Summary Extraction

- **Context**: Top comments need cleanup before being used as summaries.
- **Block comment cleanup**:
  1. Remove `/*` and `*/` delimiters
  2. Split by newlines
  3. Trim each line and remove leading `*` (JSDoc style)
  4. Filter empty lines
  5. Join with spaces
- **Single-line comment cleanup**:
  1. Split by newlines
  2. For each line, trim and remove `//` prefix
  3. Filter empty results
  4. Join with spaces
- **Output**: Single-line normalized summary string.

## Avoid `index.ts` Barrel Files

- **Context**: Barrel files (index.ts that re-exports from sibling modules) create circular dependency risks.
- **Decision**: Do not use `index.ts` barrel files in this project.
- **Alternative**: Import directly from source files.
- **Rationale**: Keeps dependency graph explicit; avoids accidental cycles during refactoring.

## Class Member AST Node Types and Extraction Patterns

- **Context**: Extracting class members (methods, getters, setters, constructors) requires handling distinct AST structures within `class_body`.
- **Member node types**:
  - `method_definition` — regular methods, getters, setters, and constructors
  - `abstract_method_signature` — abstract methods in abstract classes
  - `accessor_pair` — getter/setter pairs (less common in recent tree-sitter versions)
- **Name extraction patterns**:
  - `property_identifier` — regular method names
  - `private_property_identifier` — private identifiers (e.g., `#touch`)
  - Constructor has `property_identifier` with text `"constructor"`
- **Getter/setter detection**: Check for `get` or `set` child nodes within `method_definition`:
  ```typescript
  const isGetter = node.children.some((child) => child.type === 'get');
  const isSetter = node.children.some((child) => child.type === 'set');
  ```
- **Computed name filtering**: Skip members where `name` field is `computed_property_name` (e.g., `[Symbol.iterator]()`):
  ```typescript
  const nameNode = node.childForFieldName('name');
  const isComputed =
    nameNode !== null &&
    nameNode.type !== 'property_identifier' &&
    nameNode.type !== 'property_identifier';
  ```
- **Signature construction rules**:
  - Constructor: `constructor(parameters)`
  - Getter: `get name()` — no parameters, no return type
  - Setter: `set name(parameters)` — has parameters, no return type
  - Method: `name(parameters): returnType` — include return type if present
- **Member attachment flow**: After parsing top-level declarations, match class declarations to their AST nodes by line ranges, then extract and attach members to `ParsedDeclaration.members` array for formatter rendering

## JSDoc Comments with Special Character Sequences

- **Context**: Certain character sequences in JSDoc block comments can be misinterpreted by TypeScript or ESLint parsers.
- **Problem**: Sequences like `//!` (Rust inner doc comment syntax) inside JSDoc comments may cause parsing errors:
  ```
  error TS1434: Unexpected keyword or identifier
  error TS1003: Identifier expected
  error TS1161: Unterminated regular expression literal
  ```
- **Solution**: Avoid special comment syntax in JSDoc descriptions. Use alternative phrasing:
  - Instead of: `Excludes //!, ///, and /* */ style comments`
  - Use: `Excludes inner doc comments, outer doc comments, and block-style comments`
- **Affected sequences**: Template literal-like syntax (`${`), regex-like patterns (`/.../`), and language-specific comment markers (`//!`, `///`)

## Tree-sitter Rust AST Node Structures

- **Context**: tree-sitter-rust uses distinct AST patterns for Rust's unique syntax.
- **Top-level declaration node types**:
  - `mod_item` — module declarations (`mod name;` or `mod name { }`)
  - `extern_crate_declaration` — `extern crate name;`
  - `use_declaration` — use clauses (extract full text via `node.text`)
  - `function_item` — functions with `function_modifiers` (async/const/unsafe/extern), `type_parameters`, `parameters`, and `->` return type children
  - `type_item` — type aliases with `type_identifier` child
  - `struct_item` — structs with `type_identifier` child
  - `enum_item` — enums with `type_identifier` child
  - `union_item` — unions with `type_identifier` child
  - `const_item` — constants with `identifier` child
  - `static_item` — statics with `identifier` child and optional `mutable_specifier`
  - `trait_item` — traits with `type_identifier` child
  - `impl_item` — impl blocks with `type_identifier`/`scoped_identifier` and optional `for` keyword
  - `foreign_mod_item` — extern blocks with `extern_modifier` containing ABI string
  - `macro_definition` — macro_rules! definitions with `identifier` child
- **Visibility modifiers**: `visibility_modifier` child contains `pub`, `pub(crate)`, etc.
- **Function signature construction**: Iterate children until `block`, collecting modifiers, name, type params, params, return type, and where clause
- **Impl block label generation**: Check for `for` keyword; if present, collect trait + type identifiers, skipping `type_parameters` for generics omission
- **Static mutable detection**: Check for `mutable_specifier` child to emit `static mut` vs `static`

## Rust Header Comment Extraction Patterns

- **Context**: Rust has multiple comment styles with different semantics.
- **Doc comments** (`///`, `//!`): Excluded from header extraction — these document items, not the file
- **Block comments** (`/* */`): Excluded from header extraction
- **Regular line comments** (`//` but not `///` or `//!`): Included in header extraction
- **Contiguous block rule**: Only consecutive regular comments at file start form the header; interrupted by doc comments, block comments, or code
- **Shebang handling**: Skip `#!/usr/bin/env rust-script` lines before comment detection
- **Pattern for detection**:
  ```typescript
  function isDocComment(line: string): boolean {
    return line.trim().startsWith('///') || line.trim().startsWith('//!');
  }
  function isRegularComment(line: string): boolean {
    return line.trim().startsWith('//') && !isDocComment(line);
  }
  ```

## Column Span Calculation for Debug Mode Source Highlighting

- **Context**: Debug mode requires accurate 1-based column coordinates to highlight declaration signatures in source files.
- **Multi-declarator variable declarations**: Each declarator needs its own span; first includes declaration kind, subsequent include only identifier:

  ```typescript
  // For: declare const a: T, b: T;
  // First declarator span: "declare const a"
  // Second declarator span: "b" (identifier only)

  let isFirst = true;
  for (const declarator of declarators) {
    if (isFirst) {
      // Use wrapper node to include 'declare' keyword
      span = getDeclarationColumnSpan(node, '', '', kind, name, undefined, ambientNode);
    } else {
      // Use declarator node's position for exact identifier location
      const startColumn = declarator.startPosition.column + 1;
      const endColumn = startColumn + name.length;
    }
    isFirst = false;
  }
  ```

- **Rationale**: Subsequent declarators in multi-declarator statements have different span requirements than the first; `getDeclarationColumnSpan` cannot handle this case directly because it always prepends the kind.
- **Binding pattern filtering**: Skip destructuring patterns when computing spans; only handle `identifier` type name nodes:
  ```typescript
  // For: const { a, b } = obj, c = 1;
  // First declarator: object_pattern (skip - no span computed)
  // Second declarator: identifier 'c' (compute span at identifier position)
  if (nameNode !== null && nameNode.type === 'identifier') {
    // Compute span for this declarator
  }
  ```
- **Anonymous default class span**: For `export default class { }`, span from `export` keyword through `class` keyword:
  ```typescript
  if (modifiers === 'export default' && parentNode !== undefined) {
    const exportKeyword = parentNode.children.find((child) => child.type === 'export');
    const classKeyword = node.children.find((child) => child.type === 'class');
    if (exportKeyword !== undefined && classKeyword !== undefined) {
      startColumn = exportKeyword.startPosition.column + 1; // 1-based
      endColumn = classKeyword.endPosition.column + 1; // End after 'class' keyword
    }
  }
  ```
- **Avoid hardcoded span lengths**: Use actual AST node positions instead of magic numbers to handle whitespace variations correctly
- **Basic pattern**: Calculate span from AST node `startPosition.column` (0-based) to signature end:
  ```typescript
  const lineStartIndex = node.startPosition.column; // 0-based from tree-sitter
  const fullSignature = `${modifiers}${kind} ${name}`;
  return {
    startColumn: lineStartIndex + 1, // Convert to 1-based
    endColumn: lineStartIndex + fullSignature.length + 1 // Exclusive end
  };
  ```
- **Wrapper node handling**: When keywords appear on wrapper nodes (e.g., `declare` on `ambient_declaration`), pass wrapper as `startNode`:
  ```typescript
  getDeclarationColumnSpan(
    innerNode, // e.g., class_declaration
    '', // signature
    '', // modifiers
    'declare class',
    name,
    undefined,
    wrapperNode // e.g., ambient_declaration for 'declare' start position
  );
  ```
- **Header comment highlighting**: Use actual source line length instead of magic numbers:
  ```typescript
  const sourceLine = sourceLines[lineNumber - 1] ?? '';
  spans.push({
    line: lineNumber,
    startColumn: 1,
    endColumn: sourceLine.length + 1 // +1 because endColumn is exclusive
  });
  ```
- **Keyword node extraction for span start**: When the declaration node starts after the keyword (e.g., `import` in `import Alias = ns.member`), find the keyword node explicitly:
  ```typescript
  const importKeyword = node.children.find((child) => child.type === 'import');
  const startColumn = (importKeyword?.startPosition.column ?? node.startPosition.column) + 1;
  const endColumn = identifier.endPosition.column + 1;
  ```
- **Exported declaration span calculation**: For exported namespace/module declarations, find the `export` keyword in the parent `export_statement` node:
  ```typescript
  const exportKeyword = exportNode.children.find((child) => child.type === 'export');
  const startColumn = (exportKeyword?.startPosition.column ?? declaration.startPosition.column) + 1;
  const endColumn = (nameNode?.endPosition.column ?? declaration.endPosition.column) + 1;
  ```
- **Adding new outline kinds for debug highlighting**: When adding a new `OutlineLine` kind that needs debug highlighting, add handling in `src/debug/debug-mode.ts` `buildHighlightSpans` function:
  ```typescript
  } else if (line.kind === 'metadata' && line.lineNumber !== undefined) {
    // Metadata: highlight the full source line
    const sourceLine = sourceLines[line.lineNumber - 1] ?? '';
    spans.push({
      line: line.lineNumber,
      startColumn: 1,
      endColumn: sourceLine.length + 1
    });
  }
  ```
- Supported kinds: `header-comment`, `metadata`, `declaration`

## Tree-sitter Go AST Node Structures

- **Context**: tree-sitter-go uses different AST patterns than TypeScript for grouped declarations.
- **Const declarations**: `const_declaration` → direct `const_spec` children (no wrapper list)
  - `const_spec` contains multiple `identifier` children for multi-name specs (e.g., `const A, B = 1, 2`)
  - Do not use `childForFieldName('name')` — it returns only the first identifier
  - Use `children.filter(c => c.type === 'identifier')` to get all names
- **Var declarations**: `var_declaration` → `var_spec_list` → `var_spec` children
  - `var_spec` contains multiple `identifier` children for multi-name specs (e.g., `var x, y = 1, 2`)
  - No `name_list` field; iterate `children.filter(c => c.type === 'identifier')`
- **Type declarations**: `type_declaration` → direct `type_spec` children (no wrapper list)
  - `type_spec.childForFieldName('name')` for identifier
- **Function declarations**: `function_declaration` or `method_declaration` (separate types)
  - `childForFieldName('name')` for function name
  - `childForFieldName('receiver')` for method receivers
  - `childForFieldName('type_parameters')` for generics
  - `childForFieldName('parameters')` for function parameters
  - `childForFieldName('result')` for return types
  - **Signature construction**: Build manually from receiver + name + type params + params + result
  - **Build tag exclusion**: Skip lines starting with `//go:` or `// +build` when extracting header comments

## Go Debug Mode Column Span Calculation

- **Context**: Go declarations require different span calculation patterns than TypeScript due to distinct AST structures.
- **Spec node handling**: For `const_spec`, `var_spec`, `type_spec`, and `type_alias` nodes, directly find the first identifier:
  ```typescript
  const identifier = node.children.find(
    (c) => c.type === 'identifier' || c.type === 'type_identifier'
  );
  if (identifier === undefined) return undefined;
  return { startColumn: 1, endColumn: identifier.endPosition.column + 1 };
  ```
- **Keyword node handling**: For declaration wrapper nodes (`const_declaration`, `var_declaration`, `type_declaration`, `function_declaration`), find keyword and identifier separately:
  ```typescript
  const keyword = node.children.find((c) => c.type === kind); // 'const', 'var', 'type', 'func'
  const identifier = node.children.find(
    (c) => c.type === 'identifier' || c.type === 'type_identifier'
  );
  ```
- **Function span calculation**: For `func` declarations, span from `func` keyword to end of signature (params or result):
  ```typescript
  const funcToken = node.children.find((c) => c.type === 'func');
  if (funcToken === undefined) return undefined;
  let endColumn: number;
  if (result !== null) endColumn = result.endPosition.column + 1;
  else if (params !== null) endColumn = params.endPosition.column + 1;
  else endColumn = nameNode.endPosition.column + 1;
  return { startColumn: funcToken.startPosition.column + 1, endColumn };
  ```
- **Grouped declarations**: Each `const_spec`, `var_spec`, `type_spec`, or `type_alias` inside grouped blocks (`type (...)`) gets its own span calculation
- **Header comment span**: Track line number when extracting comments; use full line highlighting (startColumn: 1, endColumn: sourceLine.length + 1)

## Avoiding Redundant Tree-sitter Parsing

- **Context**: Multiple analysis passes over the same source file (e.g., extracting declarations then attaching class members).
- **Problem**: Re-parsing the same content with `parser.parse(content)` creates Nx parsing overhead.
- **Pattern**: Return the parsed tree alongside extracted data:

  ```typescript
  interface ParseResult {
    declarations: ParsedDeclaration[];
    tree: Parser.Tree; // Pass to subsequent analysis
  }

  function parseWithTree(content: string, deps: ParseDependencies): ParseResult {
    const parser = deps.createParser();
    const tree = parser.parse(content);
    const declarations = extractDeclarations(tree.rootNode);
    return { declarations, tree };
  }
  ```

- **Consumption**: Pass the tree to downstream functions instead of re-parsing:
  ```typescript
  const { declarations, tree } = parseWithTree(content, deps);
  const withMembers = attachClassMembers(declarations, tree); // No re-parsing
  ```
- **Benefits**: Eliminates redundant parsing (2x speedup for multi-pass analysis), maintains testability (inject mock trees), keeps public API unchanged.
- **Rationale**: Tree-sitter parses are idempotent for the same content; reuse the AST when multiple extraction passes are required.

## Refactoring Large Outline Modules

- **Context**: `outline.ts` grew to 600+ lines with duplicated helper functions and mixed concerns.
- **Pattern**: Extract shared helpers and specialized logic into focused modules:
  1. Identify functions used by multiple modules (e.g., `findExportDeclaration` used by both outline and class-members)
  2. Create `outline-helpers.ts` for pure utility functions with no side effects
  3. Extract cohesive feature modules (e.g., `class-members.ts` for member attachment)
  4. Rename functions for clarity (`extractXxxDeclarations` → `convertXxxDeclarations` when transforming nodes)
  5. Extract pure builder functions for complex output construction
- **Result**: `outline.ts` reduced from 638 to 555 lines; new 81-line `class-members.ts` and 62-line `outline-helpers.ts`
- **Benefits**: Single responsibility per module, reusable helpers, clearer naming, easier testing
- **Verification**: All 126 tests pass, typecheck passes, lint passes

## Rust Debug Mode Multiline Where Clause Span Calculation

- **Context**: Debug mode highlighting for Rust function signatures with multiline `where` clauses.
- **Problem**: Functions with multiline where clauses had no debug highlighting because the signature line lacks `{` or `;` (they appear on subsequent lines).
- **Fix**: In `calculateDeclarationSpan`, when no `{` or `;` found on current line, check if next line starts with `where`; if so, return span to end of current line:
  ```typescript
  const nextLine = lines[startLine];
  if (nextLine !== undefined && nextLine.trim().startsWith('where')) {
    // Calculate end of current line, then return span
  }
  ```

## Rust Use Declaration Debug Span Calculation

- **Context**: Debug mode highlighting for Rust `use` declarations with brace-enclosed imports.
- **Problem**: Use declarations like `use std::collections::{HashMap, HashSet};` contain `{` which was incorrectly used as the span end, truncating the highlight.
- **Fix**: Added `isUseDeclaration` parameter to `findSignatureEndOnLine`; for use declarations, prefer semicolon over brace:
  ```typescript
  if (isUseDeclaration) {
    if (semicolonPos !== -1) {
      // Return position before semicolon
    }
  }
  ```
- **Detection**: Check if source line starts with `use ` (trimmed).

## Rust Function Signature Item vs Function Item

- **Context**: Tree-sitter Rust parser distinguishes between functions with and without bodies.
- **Node types**:
  - `function_item` — functions with body (`fn foo() { }`)
  - `function_signature_item` — function declarations without body (`fn foo() -> i32;`)
- **Implication**: Both need to be handled in the switch statement to parse all function declarations:
  ```typescript
  case 'function_item':
  case 'function_signature_item':
    decl = parseFunctionItem(node);
    break;
  ```
- **Verification**: Use tree-sitter CLI (`node -e "const Parser = require('tree-sitter'); ..."`) to inspect AST node types for edge cases.

## Function Signature Extraction with Async/Generator Modifiers

- **Context**: Extracting function signatures requires handling multiple modifier children in a single pass.
- **AST structure**: TypeScript function nodes have children including:
  - `async` — modifier keyword
  - `*` — generator indicator (attached to `function`, produces `function*`)
  - `identifier` — function name
- **Pattern**: Use a single loop with a flag to track generator state:
  ```typescript
  let hasFunction = false;
  for (const child of node.children) {
    if (child.type === 'async') prefix = 'async ';
    else if (child.type === '*') {
      prefix += 'function*';
      hasFunction = true;
    } else if (child.type === 'identifier') name = child.text;
  }
  if (!hasFunction) prefix += 'function';
  ```
- **Pitfall**: Do not use `!prefix.endsWith('function')` to check — it fails for `function*` since it ends with `*`
- **Verification**: Check test fixtures for `async function*` and `function*` patterns

## Typed Params Object for Declaration Span API

- **Context**: Refactoring declaration span calculation to use typed params object instead of positional arguments.
- **Pattern**: Use an interface for clearer object-style arguments:

  ```typescript
  interface ColumnSpanParams {
    node: SyntaxNode;
    signature: string;
    modifiers: string;
    kind: string;
    name: string;
    nameNode?: SyntaxNode;
    startNode?: SyntaxNode;
  }

  function getDeclarationColumnSpan(params: ColumnSpanParams): Span | undefined {
    const { node, signature, modifiers, kind, name, nameNode, startNode } = params;
    // ... implementation
  }
  ```

- **Benefits**: Named parameters improve readability, IDE autocomplete shows available options, optional params are explicit, order-independent.
- **Call sites**: Pass object with only needed fields; unused fields default to appropriate values in implementation.
- **Migration**: Update all call sites to use object syntax; remove positional arguments.

## Discriminated Unions for Validation Functions

- **Context**: Validation functions that return `{ valid: boolean, error?: string }` require redundant undefined checks at call sites.
- **Pattern**: Use a discriminated union to encode success/failure with typed payloads:
  ```typescript
  function validateInput(
    args: readonly string[]
  ): { valid: true; arg: string } | { valid: false; error: string } {
    if (args.length !== 1) {
      return { valid: false, error: 'Expected exactly one argument' };
    }
    const [arg] = args;
    if (arg === undefined) {
      return { valid: false, error: 'Argument is undefined' };
    }
    return { valid: true, arg };
  }
  ```
- **Consumption**: TypeScript narrows the union based on `valid` discriminator:
  ```typescript
  const result = validateInput(args);
  if (!result.valid) {
    // result.error is string (not optional)
    failWithError(result.error);
    return;
  }
  // result.arg is string (guaranteed present)
  processInput(result.arg);
  ```
- **Benefits**: Eliminates redundant undefined checks; type-safe access to success/error payloads; self-documenting return type; compiler enforces handling both branches.
- **Applicability**: Input validation, parser results, operation outcomes with typed errors.
