/**
 * Rust language engine for outline generation.
 * Parses Rust source files and emits outline entries for top-level declarations.
 */

import type Parser from 'tree-sitter';
import { type SyntaxNode as SyntaxNodeType } from 'tree-sitter';
import Rust from 'tree-sitter-rust';

import type { OutlineLanguageEngine, SummaryResult } from '../../core/language-engine.js';
import type {
  OutlineLine,
  OutlineOptions,
  OutlineResult,
  ParsedDeclaration
} from '../../core/types.js';
import { getNodeLineRangeBasic } from '../typescript/extractors/node-utils.js';
import { normalizeWhitespace } from '../../core/formatter.js';
import { createOutlineResult } from '../../core/outline-renderer.js';
import { buildDeclarationOutlineLines } from '../../core/declaration-lines.js';
import { buildHeaderCommentOutlineLines } from '../../core/header-comment-lines.js';
import { createConfiguredParser } from '../shared/parser-factory.js';
import { extractRustHeaderComment } from './header-comment.js';

const RUST_EXTENSION = '.rs';

function matchesRustFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(RUST_EXTENSION);
}

/**
 * Creates and configures a parser for Rust.
 */
function createRustParser(): Parser {
  return createConfiguredParser(Rust);
}

/**
 * Extracts the identifier name from a node.
 */
function getIdentifier(node: SyntaxNodeType): string | null {
  const identifierNode = node.children.find(
    (child) => child.type === 'identifier' || child.type === 'type_identifier'
  );
  return identifierNode?.text ?? null;
}

/**
 * Parses a function_item node and extracts its declaration.
 * Returns the full signature from first qualifier through return type, excluding body.
 */
function parseFunctionItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Build signature by collecting parts before the body
  const parts: string[] = [];
  let seenArrow = false;
  let seenReturnType = false;

  for (const child of node.children) {
    // Stop at block (function body)
    if (child.type === 'block') {
      break;
    }

    // Handle visibility modifier (pub)
    if (child.type === 'visibility_modifier') {
      parts.push(child.text);
      continue;
    }

    // Handle function modifiers (async, const, unsafe, extern_modifier)
    if (child.type === 'function_modifiers') {
      parts.push(child.text);
      continue;
    }

    // Handle fn keyword
    if (child.type === 'fn') {
      parts.push('fn');
      continue;
    }

    // Handle identifier (function name)
    if (child.type === 'identifier') {
      parts.push(name);
      continue;
    }

    // Handle type parameters (generics)
    if (child.type === 'type_parameters') {
      parts.push(child.text);
      continue;
    }

    // Handle parameters
    if (child.type === 'parameters') {
      parts.push(child.text);
      continue;
    }

    // Handle return type (-> Type)
    if (child.type === '->') {
      parts.push('->');
      seenArrow = true;
      continue;
    }

    // Handle return type (the type node immediately after ->)
    if (seenArrow && !seenReturnType) {
      parts.push(child.text);
      seenReturnType = true;
      continue;
    }

    // Handle where clause - include it as part of signature
    if (child.type === 'where_clause') {
      parts.push(child.text);
      continue;
    }
  }

  const signature = normalizeWhitespace(parts.join(' '));

  return {
    kind: 'fn',
    name,
    modifiers: '',
    signature,
    startLine,
    endLine
  };
}

/**
 * Parses a mod_item node.
 */
function parseModItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  return {
    kind: 'mod',
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine
  };
}

/**
 * Parses an extern_crate_declaration node.
 */
function parseExternCrateItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  return {
    kind: 'extern crate',
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine
  };
}

/**
 * Parses a use_declaration node.
 * Returns full clause text with normalized whitespace.
 */
function parseUseDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Get the use clause text, excluding the semicolon
  const useText = node.text.replace(/;\s*$/, '');
  const signature = normalizeWhitespace(useText);

  // Extract a name for the declaration (last component)
  const lastPart = signature.split('::').pop() ?? 'use';

  return {
    kind: 'use',
    name: lastPart,
    modifiers: '',
    signature,
    startLine,
    endLine
  };
}

/**
 * Extracts the type identifier name from a node.
 */
function extractTypeIdentifier(node: SyntaxNodeType): string | null {
  return node.children.find((child) => child.type === 'type_identifier')?.text ?? null;
}

/**
 * Extracts the visibility modifier from a node if present.
 */
function extractVisibilityModifier(node: SyntaxNodeType): string {
  return node.children.find((child) => child.type === 'visibility_modifier')?.text ?? '';
}

/**
 * Creates a parser function for type-like items (struct, enum, union, type alias).
 * These items share a common structure: they have a type_identifier and optional visibility.
 */
function createTypeItemParser(
  kind: ParsedDeclaration['kind']
): (node: SyntaxNodeType) => ParsedDeclaration | null {
  return (node: SyntaxNodeType): ParsedDeclaration | null => {
    const name = extractTypeIdentifier(node);
    if (name === null) {
      return null;
    }

    const { startLine, endLine } = getNodeLineRangeBasic(node);
    const visibility = extractVisibilityModifier(node);

    return {
      kind,
      name,
      modifiers: visibility,
      signature: '',
      startLine,
      endLine
    };
  };
}

const parseTypeItem = createTypeItemParser('type');
const parseStructItem = createTypeItemParser('struct');
const parseEnumItem = createTypeItemParser('enum');
const parseUnionItem = createTypeItemParser('union');

/**
 * Parses a const_item node.
 */
function parseConstItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Check for visibility modifier
  const visibility =
    node.children.find((child) => child.type === 'visibility_modifier')?.text ?? '';

  return {
    kind: 'const',
    name,
    modifiers: visibility,
    signature: '',
    startLine,
    endLine
  };
}

/**
 * Parses a static_item node.
 */
function parseStaticItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Check for visibility modifier
  const visibility =
    node.children.find((child) => child.type === 'visibility_modifier')?.text ?? '';

  // Check for mut specifier
  const hasMut = node.children.some((child) => child.type === 'mutable_specifier');

  const kind = hasMut ? 'static mut' : 'static';

  return {
    kind,
    name,
    modifiers: visibility,
    signature: '',
    startLine,
    endLine
  };
}

/**
 * Parses a trait_item node.
 */
function parseTraitItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = node.children.find((child) => child.type === 'type_identifier')?.text ?? null;
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Check for visibility modifier
  const visibility =
    node.children.find((child) => child.type === 'visibility_modifier')?.text ?? '';

  return {
    kind: 'trait',
    name,
    modifiers: visibility,
    signature: '',
    startLine,
    endLine
  };
}

/**
 * Parses an impl_item node.
 * Returns `impl <trait> for <type>` or `impl <type>` (omitting generics).
 */
function parseImplItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Find the 'for' keyword to determine if this is trait impl or inherent impl
  const hasFor = node.children.some((child) => child.type === 'for');

  let signature: string;

  if (hasFor) {
    // Trait impl: impl Trait for Type
    // Collect identifiers after impl and before declaration_list, skipping type_parameters
    const parts: string[] = ['impl'];

    for (const child of node.children) {
      if (child.type === 'declaration_list') break;
      if (child.type === 'type_parameters') continue; // Skip generics
      if (child.type === 'type_identifier') {
        parts.push(child.text);
      } else if (child.type === 'for') {
        parts.push('for');
      } else if (child.type === 'scoped_identifier' || child.type === 'generic_type') {
        // For complex types, extract just the base name
        parts.push(child.text.split('<')[0]?.trim() ?? child.text);
      }
    }

    signature = normalizeWhitespace(parts.join(' '));
  } else {
    // Inherent impl: impl Type
    // Find the first type_identifier that's not in type_parameters
    let typeName: string | null = null;

    for (const child of node.children) {
      if (child.type === 'declaration_list') break;
      if (child.type === 'type_parameters') continue; // Skip generics
      if (child.type === 'type_identifier') {
        typeName = child.text;
        break;
      }
      if (child.type === 'scoped_identifier' || child.type === 'generic_type') {
        typeName = child.text.split('<')[0]?.trim() ?? child.text;
        break;
      }
    }

    if (typeName === null) {
      return null;
    }

    signature = `impl ${typeName}`;
  }

  // Extract a name for the declaration (the type being implemented)
  // The signature format is either "impl Trait for Type" or "impl Type"
  const name = signature.replace('impl ', '').replace(' for ', '_');

  return {
    kind: 'impl',
    name,
    modifiers: '',
    signature,
    startLine,
    endLine
  };
}

/**
 * Parses a foreign_mod_item (extern block) node.
 */
function parseForeignModItem(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRangeBasic(node);

  // Find extern_modifier to get ABI string
  const externModifier = node.children.find((child) => child.type === 'extern_modifier');

  let signature: string;
  if (externModifier !== undefined) {
    // Has ABI string like extern "C"
    const abiString =
      externModifier.children.find((child) => child.type === 'string_literal')?.text ?? '';
    signature = abiString.length > 0 ? `extern ${abiString}` : 'extern';
  } else {
    signature = 'extern';
  }

  return {
    kind: 'extern',
    name: '',
    modifiers: '',
    signature,
    startLine,
    endLine
  };
}

/**
 * Parses a macro_definition (macro_rules!) node.
 */
function parseMacroDefinition(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);

  return {
    kind: 'macro_rules!',
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine
  };
}

type RustDeclarationParser = (node: SyntaxNodeType) => ParsedDeclaration | null;

const RUST_DECLARATION_PARSERS: Readonly<Record<string, RustDeclarationParser>> = {
  mod_item: parseModItem,
  extern_crate_declaration: parseExternCrateItem,
  use_declaration: parseUseDeclaration,
  type_item: parseTypeItem,
  struct_item: parseStructItem,
  enum_item: parseEnumItem,
  union_item: parseUnionItem,
  const_item: parseConstItem,
  static_item: parseStaticItem,
  trait_item: parseTraitItem,
  impl_item: parseImplItem,
  foreign_mod_item: parseForeignModItem,
  macro_definition: parseMacroDefinition,
  function_item: parseFunctionItem,
  function_signature_item: parseFunctionItem
};

/**
 * Parses declarations from the Rust AST.
 */
function parseRustDeclarations(content: string): ParsedDeclaration[] {
  const parser = createRustParser();
  const tree = parser.parse(content);
  const declarations: ParsedDeclaration[] = [];

  const rootNode = tree.rootNode;

  for (const node of rootNode.children) {
    const nodeType = node.type;

    // Skip comments
    if (nodeType === 'line_comment' || nodeType === 'block_comment') {
      continue;
    }

    const parserForNode = RUST_DECLARATION_PARSERS[nodeType];
    if (parserForNode === undefined) {
      continue;
    }

    const decl = parserForNode(node);

    if (decl !== null) {
      declarations.push(decl);
    }
  }

  return declarations;
}

/**
 * Finds the end position of a declaration signature on a single line.
 * Looks for { or ; (whichever comes first) to determine where signature ends.
 * For use declarations, prefers ; to handle { in the import list.
 * Returns undefined if neither is found on the line.
 */
function findSignatureEndOnLine(sourceLine: string, isUseDeclaration: boolean): number | undefined {
  const bracePos = sourceLine.indexOf('{');
  const semicolonPos = sourceLine.indexOf(';');

  // For use declarations, prefer semicolon over brace to properly highlight the full import
  if (isUseDeclaration) {
    if (semicolonPos !== -1) {
      let endPos = semicolonPos;
      while (endPos > 0 && (sourceLine[endPos - 1] === ' ' || sourceLine[endPos - 1] === '\t')) {
        endPos--;
      }
      return endPos;
    }
    return undefined;
  }

  let endPos: number;
  if (bracePos !== -1 && semicolonPos !== -1) {
    endPos = Math.min(bracePos, semicolonPos);
  } else if (bracePos !== -1) {
    endPos = bracePos;
  } else if (semicolonPos !== -1) {
    endPos = semicolonPos;
  } else {
    return undefined;
  }

  // Back up from { or ; to exclude trailing whitespace
  while (endPos > 0 && (sourceLine[endPos - 1] === ' ' || sourceLine[endPos - 1] === '\t')) {
    endPos--;
  }

  return endPos;
}

/**
 * Calculates the highlight span for a Rust declaration.
 * Returns span from start of line to position before { or ; on the same line.
 * Returns undefined for multi-line declarations (except multiline where clauses).
 */
function calculateDeclarationSpan(
  sourceLines: readonly string[],
  startLine: number
): { startColumn: number; endColumn: number } | undefined {
  const sourceLine = sourceLines[startLine - 1];
  if (sourceLine === undefined) {
    return undefined;
  }

  // Check if this is a use declaration
  const trimmedLine = sourceLine.trim();
  const isUseDeclaration = trimmedLine.startsWith('use ');

  const endPos = findSignatureEndOnLine(sourceLine, isUseDeclaration);
  if (endPos === undefined) {
    // No { or ; on this line - check for multiline where clause
    // If the next line starts with 'where', highlight to end of current line
    const nextLine = sourceLines[startLine];
    if (nextLine !== undefined) {
      const trimmedNext = nextLine.trim();
      if (trimmedNext.startsWith('where')) {
        // Highlight from start to end of current line (excluding trailing whitespace)
        let lineEndPos = sourceLine.length;
        while (
          lineEndPos > 0 &&
          (sourceLine[lineEndPos - 1] === ' ' ||
            sourceLine[lineEndPos - 1] === '\t' ||
            sourceLine[lineEndPos - 1] === '\r')
        ) {
          lineEndPos--;
        }

        // Skip whitespace to find actual start
        let startPos = 0;
        while (
          startPos < sourceLine.length &&
          (sourceLine[startPos] === ' ' || sourceLine[startPos] === '\t')
        ) {
          startPos++;
        }

        if (startPos < lineEndPos) {
          return {
            startColumn: startPos + 1,
            endColumn: lineEndPos + 1
          };
        }
      }
    }
    return undefined;
  }

  // Skip whitespace to find actual start
  let startPos = 0;
  while (
    startPos < sourceLine.length &&
    (sourceLine[startPos] === ' ' || sourceLine[startPos] === '\t')
  ) {
    startPos++;
  }

  // Only highlight if there's something to highlight
  if (startPos >= endPos) {
    return undefined;
  }

  return {
    startColumn: startPos + 1, // 1-based
    endColumn: endPos + 1 // exclusive, 1-based
  };
}

/**
 * Generates an outline from Rust source content.
 * Extracts top-level declarations including mod, extern crate, use, fn, type,
 * struct, enum, union, const, static, trait, impl, extern blocks, and macro_rules!.
 */
function generateRustOutline(options: OutlineOptions): OutlineResult {
  const { filePath, content } = options;
  const declarations = parseRustDeclarations(content);
  const sourceLines = content.split('\n');

  // Extract header comment to include in outline
  const headerComment = extractRustHeaderComment(content);

  const lines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];

  lines.push(...buildHeaderCommentOutlineLines(headerComment));
  lines.push(
    ...buildDeclarationOutlineLines(declarations, {
      spanForDeclaration: (declaration) =>
        calculateDeclarationSpan(sourceLines, declaration.startLine)
    })
  );

  return createOutlineResult(lines, headerComment?.joinedText ?? null);
}

/**
 * Extracts a summary from Rust source content.
 * Returns the contiguous block of // lines at file start,
 * ignoring optional shebang and leading blank lines.
 * Excludes inner doc comments, outer doc comments, and block-style comments.
 */
function extractRustSummary(content: string): SummaryResult {
  const headerComment = extractRustHeaderComment(content);
  return { summary: headerComment?.joinedText ?? null };
}

export const rustLanguageEngine: OutlineLanguageEngine = {
  id: 'rust',
  matchesFilePath: matchesRustFilePath,
  generateOutline: generateRustOutline,
  extractSummary: extractRustSummary
};
