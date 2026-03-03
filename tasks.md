# outln Improvement Tasks

## Java/Kotlin/C# Specific

### ✅ Completed Features

**Java:**

- Classes, interfaces, enums, annotations
- Methods, constructors, fields
- Records with compact constructors
- Generics/type parameters
- Sealed classes with permits clause
- Nested classes
- Modifiers and annotations

**Kotlin:**

- Classes, objects, interfaces, enums
- Functions, properties, type aliases
- Companion objects
- Primary/secondary constructors
- Generics/type parameters
- Sealed classes/interfaces
- Nested classes
- Default parameters
- Reified type parameters

**C#:**

- Classes, interfaces, structs, enums
- Records (C# 9+)
- Methods, constructors, properties, fields
- Delegates
- Generics/type parameters
- Modifiers and attributes

### Missing Tests

**Java:**

- [x] Sealed classes with permits clause
- [x] Records with compact constructors
- [x] Deeply nested classes (3+ levels)
- [x] Generics in various contexts (multiple type parameters, bounded types)
- [x] Annotation methods with default values
- [x] Static imports

**Kotlin:**

- [x] Sealed classes/interfaces
- [x] Reified type parameters
- [x] Default parameter values in output
- [x] Value classes (`@JvmInline value class`)
- [x] Deeply nested classes (3+ levels)
- [x] Extension functions
- [x] Infix functions
- [x] Enum entries with members
- [x] Data classes (show `data` modifier in output)
- [x] Suspend functions (coroutines)
- [x] Inline functions (non-reified)
- [x] Lateinit properties
- [x] Delegated properties
- [x] Init blocks
- [x] Inner classes
- [x] Nested objects
- [x] Local classes
- [x] Anonymous objects
- [x] Inline properties
- [x] Enum entries with anonymous classes
- [x] Value classes with inline modifier

**Java:**

- [x] Abstract classes and methods - Test `abstract` modifier on classes and methods (modifier is parsed but needs test coverage)
- [x] Final classes and methods - Test `final` modifier on classes and methods (modifier is parsed but needs test coverage)
- [x] Native methods - Test `native` modifier on methods (modifier is parsed but needs test coverage)
- [x] Static methods and fields - Test `static` modifier on methods and fields (modifier is parsed but needs test coverage)
- [x] Volatile fields - Test `volatile` modifier on fields (modifier is parsed but needs test coverage)
- [x] Transient fields - Test `transient` modifier on fields (modifier is parsed but needs test coverage)
- [x] Default methods in interfaces - Parse and test `default` modifier on interface methods
- [x] Static methods in interfaces - Test `static` methods in interface declarations
- [x] Private methods in interfaces - Test `private` methods in interface declarations (Java 9+)
- [x] Varargs methods - Parse varargs syntax with `Type...` parameter and show in signatures
- [x] Wildcard generics - Parse wildcard types `?`, `? extends Type`, `? super Type` in generic declarations
- [x] Sealed interfaces - Parse `sealed` modifier on interfaces with `permits` clause (Java 17+)

**Kotlin:**

- [ ] Lateinit properties - Parse `lateinit` modifier on mutable properties
- [ ] Delegated properties - Parse `by` delegation syntax and show delegate in signature
- [ ] Init blocks - Parse and display `init` blocks in class declarations
- [ ] Inner classes - Parse `inner` modifier on nested classes and show in signatures
- [ ] Nested objects - Parse object declarations inside classes as nested members
- [ ] Local classes - Parse class declarations inside functions (if tree-sitter supports)
- [ ] Anonymous objects - Parse object expressions (anonymous classes)
- [ ] Inline properties - Parse `inline` modifier on properties
- [ ] Enum entries with anonymous classes - Parse enum entries with overridden methods/custom implementations
- [ ] Value classes with inline modifier - Test `inline value class` syntax (Kotlin 1.5+)

**C#:**

- [x] Abstract members - Parse `abstract` modifier on methods/properties/fields
- [x] Virtual/override members - Show `virtual` and `override` modifiers in signatures
- [x] Sealed members - Parse `sealed` modifier on methods/properties
- [x] Extern/unsafe modifiers - Parse `extern` and `unsafe` modifiers
- [x] Async methods - Show `async` modifier and `Task<T>` return types
- [x] Extension methods - Detect and show `this` parameter (e.g., `static void Method(this Type param)`)
- [x] Static methods/classes - Show `static` modifier
- [x] Readonly fields - Parse `readonly` modifier on fields
- [x] Attributes on members - Parse attributes on methods, properties, fields, classes
- [x] Partial classes - Parse `partial` modifier on class declarations
- [x] Primary constructors (C# 12+) - Parse `class Person(string name)` syntax (now shows parameters)
- [x] Generic constraints - Show `where T : constraint` clauses in signatures
- [x] Constants - Parse `const` field declarations (marked as 'constant' kind)
- [x] Events - Parse event declarations (field-like and accessor syntax)
- [x] Indexers - Parse indexer declarations with multiple parameters
- [x] Operators - Parse unary, binary, and conversion operators
- [x] Finalizers - Parse `~ClassName()` destructor syntax
- [x] Explicit interface implementations - Detect `void IInterface.Method()` syntax
- [x] Partial classes - Parse and show `partial` modifier
- [x] Static classes - Parse and show `static` modifier

### Remaining Features

**High Priority:**

- [x] **Java Pattern Matching for instanceof** - Support instanceof with pattern binding (Java 16+)
  - Note: This is low priority for outline as it only shows declarations, not method body implementations

- [x] **Java Type Annotations on Type Uses** - Parse annotations on types
  - Type annotations are automatically captured in signatures (e.g., `List<@NonNull String>`)

**Medium Priority:**

- [x] Kotlin tailrec functions - Parse `tailrec` modifier on recursive functions
- [x] Kotlin anonymous objects/object expressions - Parse object expressions assigned to variables
- [x] Kotlin inline value classes - Test `inline value class` syntax (Kotlin 1.5+)
- [x] Kotlin expect/actual declarations - Parse multiplatform declarations
- [x] Java local classes - Parse class declarations inside methods (if tree-sitter supports)
- [x] Java anonymous classes - Parse anonymous class instantiations
- [x] Records with custom members beyond compact constructors - Parse records with additional methods/fields
- [x] Kotlin property getters/setters (custom) - Custom property accessors are shown in property declarations

**Medium Priority:**

- [x] Kotlin delegated properties - Show `by` delegation
- [x] Kotlin property getters/setters (custom)
- [x] Kotlin init blocks
- [x] Java records with custom members beyond compact constructors

**Low Priority:**

- [x] Kotlin destructuring declarations
- [x] Java pattern matching (switch expressions)

## New Languages

### High Priority

- [ ] **Python** - Classes, functions, decorators, type hints, async functions

### Medium Priority

- [ ] **C++** - Classes, templates, namespaces, concepts (C++20)
- [ ] **Ruby** - Classes, modules, methods, include/extend
- [ ] **PHP** - Classes, traits, interfaces, attributes

### Low Priority

- [ ] **Swift** - Classes, structs, protocols, extensions
- [ ] **Scala** - Classes, traits, objects, case classes
- [ ] **Groovy** - Classes, traits, closures

## Feature Additions

### High Priority

- [ ] **Documentation extraction** - Optional `--docs` flag to show first sentence of Javadoc/KDoc per declaration
- [ ] **Visibility filter** - `--public-only` to hide private/internal members
- [ ] **JSON output** - Structured output for tooling integration (`--json`)

### Medium Priority

- [ ] **Inheritance view** - Show class hierarchy with `--hierarchy` flag
  - Display extends/implements as a tree structure
  - Show interface implementations
- [ ] **Markdown output** - Format for documentation (`--markdown`)
  - Generate MD with links to source files
  - Create tables for class members
- [ ] **Signature depth** - `--signature-depth=N` to control parameter detail
  - Level 1: Just names
  - Level 2: Names + types
  - Level 3: Full signatures including default values

### Low Priority

- [ ] **Call graph** - Basic function call relationships (experimental)
- [ ] **Dependency analysis** - Show import/usage relationships between files
- [ ] **Metrics** - Code complexity metrics (lines, cyclomatic complexity)
- [ ] **Diff mode** - Compare outlines between git commits/branches

## Quality of Life

### High Priority

- [ ] **Config file** - `.outlnrc` or `outln.config.js` for default options
  ```json
  {
    "exclude": ["**/test/**", "**/*.generated.*"],
    "visibility": "public",
    "output": "json"
  }
  ```
- [ ] **Better glob handling** - Respect `.gitignore` by default
- [ ] **Performance** - Cache parsed AST for large codebases

### Medium Priority

- [ ] **Watch mode** - `--watch` to re-run on file changes
- [ ] **Parallel processing** - Process multiple files concurrently
- [ ] **Progress indicator** - Show progress for large directories
- [ ] **Error recovery** - Continue processing other files when one fails to parse

### Low Priority

- [ ] **Editor integration** - LSP server mode for IDE support
- [ ] **REPL mode** - Interactive outline exploration
- [ ] **Plugin system** - Allow custom language engines via plugins

## Output Improvements

### High Priority

- [ ] **Consistent formatting** - Ensure all languages follow same output conventions
- [ ] **Color output** - Syntax highlighting in terminal (optional `--color`)
- [ ] **Line context** - `--context=N` to show N lines around each declaration

### Medium Priority

- [ ] **Sorting options** - Sort by name, line number, kind, visibility
- [ ] **Filtering** - `--filter=class,function,val` to show only specific kinds
- [ ] **Grouping** - Group declarations by visibility, kind, or file section

### Low Priority

- [ ] **ASCII art tree** - Visual tree structure for nested classes
- [ ] **Statistics summary** - Show counts of each declaration type
- [ ] **Cross-references** - Link related declarations (overrides, implementations)

## Testing & Documentation

### Test Coverage

**Currently Tested:**

- Java (23 tests): Basic outline, empty file, enums/annotations, header comments, inheritance, sealed classes, records, nested classes (4 levels), generics (multiple type params, bounded), annotation defaults, static imports, interface default methods, interface static methods, interface private methods, varargs, wildcard generics, sealed interfaces with permits, **type annotations on type uses**, **anonymous classes**, **records with custom members**, **switch expressions with pattern matching**
- Kotlin (20 tests): Basic outline, empty file, functions, header comments, inheritance, properties, type alias, script, sealed classes, reified types, value classes, extension functions, infix functions, enum entries with members, data classes, suspend functions, inline functions, advanced features (lateinit, delegated properties, init blocks, inner classes, nested objects, local classes, anonymous objects, inline value classes), **tailrec functions**, **custom property getters/setters**, **expect/actual declarations**, **destructuring declarations**
- C# (19 tests): Basic outline, delegates, empty file, enums, generics, header comments, inheritance, interfaces/structs, nested classes, records, events, indexers, operators, finalizers, modifiers (abstract, virtual, override, sealed, async), const/readonly fields, partial/static classes, explicit interface implementations, extension methods - all features now working including primary constructor parameters
- TypeScript/JavaScript: Full coverage (186 tests)
- Go: Basic outline, generics, type aliases, group declarations
- Rust: Basic outline, complex signatures, use declarations, doc comments
- Markdown: Headings, frontmatter, fenced code blocks

### Remaining

- [ ] **Benchmark suite** - Performance testing on large codebases
- [ ] **Documentation site** - Generate docs from README and examples
- [ ] **Language support matrix** - Clear table of what's supported per language

---

## Known Issues

- None currently

## Bug Fixes

- Fixed Java generics: Type parameters now correctly appear after class name (`Box<T>` instead of `<T> Box`)
- Fixed Kotlin enum entries: Now properly parse enum entries with member functions and their class bodies

## Validation Status

- ✅ **All tests passing** - 249/249 tests pass (Java has 23 tests including: interface default methods, interface static methods, interface private methods, varargs, wildcard generics, sealed interfaces, type annotations, anonymous classes, records with custom members, switch expressions; C# has 19 tests; Kotlin has 20 tests including: advanced features - lateinit, delegated properties, init blocks, inner classes, nested objects, local classes, anonymous objects, inline value classes, tailrec functions, custom property accessors, expect/actual declarations, destructuring)
- ✅ **Linting** - All checks pass
- ✅ **Type checking** - No errors
- ✅ **Build** - Compiles successfully
