/**
 * Core type definitions for outline generation.
 */

/**
 * Options for outline generation.
 */
export interface OutlineOptions {
  /** The file path to include in the heading */
  filePath: string;
  /** The source code content */
  content: string;
}

/**
 * Semantic kind of an output outline line.
 */
export type OutlineLineKind = 'file-path' | 'header-comment' | 'declaration' | 'metadata';

/**
 * Declaration kind identifier.
 * Use language-specific values (for example: "function", "class", "type", "const").
 */
export type DeclarationKind = string;

/**
 * Parsed declaration data extracted from a language parser.
 */
export interface ParsedDeclaration {
  /**
   * Language-specific declaration kind.
   */
  kind: DeclarationKind;
  /** The name of the declaration (empty for anonymous default functions) */
  name: string;
  /** Export modifiers: '', 'export', or 'export default' */
  modifiers: string;
  /** Full signature without body (for functions) or type annotation (for variables) */
  signature: string;
  /** Start line number (1-based inclusive) */
  startLine: number;
  /** End line number (1-based inclusive) */
  endLine: number;
  /**
   * Optional nested members for declarations that support hierarchy
   * (for example: class members like methods, constructors, getters, setters).
   */
  members?: ParsedDeclaration[];
  /**
   * Start column (1-based inclusive) for signature text within startLine.
   * Used by debug mode for accurate source highlighting.
   */
  startColumn?: number;
  /**
   * End column (1-based exclusive) for signature text within startLine.
   * Used by debug mode for accurate source highlighting.
   */
  endColumn?: number;
  /**
   * Optional declarator-specific line number for multi-declarator statements.
   * When present, this is the actual line of the identifier declarator,
   * which may differ from startLine for subsequent declarators on new lines.
   * Used by debug mode for accurate highlighting of multiline const statements.
   */
  declaratorLine?: number;
}

/**
 * Span metadata for source highlighting in debug mode.
 */
export interface OutlineLineSpan {
  /** Start column (1-based inclusive) */
  startColumn: number;
  /** End column (1-based exclusive) */
  endColumn: number;
}

/**
 * Single rendered line in an outline with its semantic kind.
 */
export interface OutlineLine {
  /** Semantic purpose of this line in the outline output */
  kind: OutlineLineKind;
  /** Exact line text as rendered (without trailing newline) */
  text: string;
  /**
   * Optional span metadata for debug mode source highlighting.
   * Present for lines that correspond to source code locations.
   */
  span?: OutlineLineSpan;
  /**
   * Optional source line number (1-based) for debug mode.
   * Present for header comments and declarations.
   */
  lineNumber?: number;
}

/**
 * Result of outline generation.
 */
export type OutlineMetadata = string | Record<string, unknown> | null;

/**
 * Result of outline generation.
 */
export interface OutlineResult<TMetadata = OutlineMetadata> {
  /** The formatted outline output */
  outline: string;
  /** Structured outline lines used to construct the final output */
  lines: OutlineLine[];
  /**
   * Language-specific metadata extracted from the file.
   * For TypeScript: the top-of-file comment string.
   * For Markdown: the parsed YAML frontmatter object.
   */
  metadata: TMetadata;
}
