/**
 * Go language engine for outline generation.
 * Parses Go source files and emits outline entries for top-level declarations.
 */

import type Parser from 'tree-sitter';
import { type SyntaxNode as SyntaxNodeType } from 'tree-sitter';
import Go from 'tree-sitter-go';

import type { OutlineLanguageEngine } from '../../core/language-engine.js';
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

const GO_EXTENSION = '.go';

function matchesGoFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(GO_EXTENSION);
}

/**
 * Creates and configures a parser for Go.
 */
function createGoParser(): Parser {
  return createConfiguredParser(Go);
}

/**
 * Gets the column span for highlighting a Go declaration.
 * Returns 1-based column positions for start and end of the highlight.
 */
function getGoDeclarationColumnSpan(
  node: SyntaxNodeType,
  kind: string
): { startColumn: number; endColumn: number } | undefined {
  // For spec nodes (const_spec, var_spec, type_spec, type_alias), use the first identifier
  if (
    node.type === 'const_spec' ||
    node.type === 'var_spec' ||
    node.type === 'type_spec' ||
    node.type === 'type_alias'
  ) {
    const identifier = node.children.find(
      (c) => c.type === 'identifier' || c.type === 'type_identifier'
    );
    if (identifier === undefined) {
      return undefined;
    }
    // Highlight from start of line to end of identifier
    return {
      startColumn: 1,
      endColumn: identifier.endPosition.column + 1
    };
  }

  // Get the keyword token (const, var, type, func)
  const firstToken = node.children.find((c) => c.type === kind);

  if (firstToken === undefined) {
    return undefined;
  }

  // Find the identifier to highlight to
  const identifier = node.children.find(
    (c) => c.type === 'identifier' || c.type === 'type_identifier'
  );
  if (identifier === undefined) {
    return undefined;
  }

  // Start from the keyword, end at the identifier
  const startColumn = firstToken.startPosition.column + 1; // 1-based
  const endColumn = identifier.endPosition.column + 1; // 1-based, exclusive

  return { startColumn, endColumn };
}

/**
 * Parses const declarations from a const_declaration node.
 * Handles both single const (const X = ...), grouped (const (...)),
 * and multi-name specs (const A, B = ...).
 */
function parseConstDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];

  for (const child of node.children) {
    // const_spec is a direct child of const_declaration
    if (child.type === 'const_spec') {
      const { startLine, endLine } = getNodeLineRangeBasic(child);
      // Get span for this specific const_spec
      const specSpan = getGoDeclarationColumnSpan(child, 'const_spec');
      // Handle multi-name specs like `const A, B = 1, 2`
      // The const_spec has multiple identifier children
      const identifiers = child.children.filter((c) => c.type === 'identifier');
      for (const name of identifiers) {
        declarations.push({
          kind: 'const',
          name: name.text,
          modifiers: '',
          signature: '',
          startLine,
          endLine,
          ...(specSpan !== undefined && {
            startColumn: specSpan.startColumn,
            endColumn: specSpan.endColumn
          })
        });
      }
    }
  }

  return declarations;
}

/**
 * Parses var declarations from a var_declaration node.
 * Handles both single var (var X = ...) and grouped (var (...)).
 */
function parseVarDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];

  for (const child of node.children) {
    // Handle var_spec for single declaration (e.g., var x = 1)
    if (child.type === 'var_spec') {
      const varSpecs = parseVarSpec(child);
      declarations.push(...varSpecs);
    }

    // Handle var_spec_list for grouped declarations (e.g., var (...))
    if (child.type === 'var_spec_list') {
      for (const spec of child.children) {
        if (spec.type === 'var_spec') {
          const varSpecs = parseVarSpec(spec);
          declarations.push(...varSpecs);
        }
      }
    }
  }

  return declarations;
}

/**
 * Parses a single var_spec node and extracts variable declarations.
 * Handles both single-name and multi-name specs (e.g., var x, y = 1, 2).
 */
function parseVarSpec(spec: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  const { startLine, endLine } = getNodeLineRangeBasic(spec);
  const specSpan = getGoDeclarationColumnSpan(spec, 'var_spec');

  // Get all identifier children - for multi-name specs like `var x, y = 1, 2`
  // the var_spec has multiple identifier children
  const identifiers = spec.children.filter((c) => c.type === 'identifier');
  for (const name of identifiers) {
    declarations.push({
      kind: 'var',
      name: name.text,
      modifiers: '',
      signature: '',
      startLine,
      endLine,
      ...(specSpan !== undefined && {
        startColumn: specSpan.startColumn,
        endColumn: specSpan.endColumn
      })
    });
  }

  return declarations;
}

/**
 * Parses type declarations from a type_declaration node.
 * Handles both single type (type X ...) and grouped (type (...)).
 * For grouped declarations, each type_spec has its own line range.
 */
function parseTypeDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];

  for (const child of node.children) {
    // type_spec and type_alias can be direct children for single and grouped declarations
    if (child.type === 'type_spec' || child.type === 'type_alias') {
      const nameNode = child.childForFieldName('name');
      if (nameNode !== null) {
        // Use the spec's line range, not the parent's
        const { startLine, endLine } = getNodeLineRangeBasic(child);
        const specSpan = getGoDeclarationColumnSpan(
          child,
          child.type === 'type_alias' ? 'type_alias' : 'type_spec'
        );
        declarations.push({
          kind: 'type',
          name: nameNode.text,
          modifiers: '',
          signature: '',
          startLine,
          endLine,
          ...(specSpan !== undefined && {
            startColumn: specSpan.startColumn,
            endColumn: specSpan.endColumn
          })
        });
      }
    }
  }

  return declarations;
}

/**
 * Parses function declarations from a function_declaration node.
 * Handles regular functions, methods with receivers, and generics.
 */
function parseFunctionDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const nameNode = node.childForFieldName('name');
  if (nameNode === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRangeBasic(node);
  const name = nameNode.text;

  // Build the signature from the declaration text, excluding the body
  const receiver = node.childForFieldName('receiver');
  const typeParams = node.childForFieldName('type_parameters');
  const params = node.childForFieldName('parameters');
  const result = node.childForFieldName('result');

  let signature = 'func ';

  // Add receiver for methods: func (r *Receiver) MethodName(...)
  if (receiver !== null) {
    signature += normalizeWhitespace(receiver.text) + ' ';
  }

  signature += name;

  // Add type parameters for generics: func Name[T any](...)
  if (typeParams !== null) {
    signature += normalizeWhitespace(typeParams.text);
  }

  // Add parameters
  if (params !== null) {
    signature += normalizeWhitespace(params.text);
  }

  // Add result/return type
  if (result !== null) {
    signature += ' ' + normalizeWhitespace(result.text);
  }

  // Calculate column span: from 'func' keyword to end of signature
  const funcToken = node.children.find((c) => c.type === 'func');
  let startColumn: number | undefined;
  let endColumn: number | undefined;

  if (funcToken !== undefined) {
    startColumn = funcToken.startPosition.column + 1; // 1-based
    // End at the result node if present, otherwise at the name
    if (result !== null) {
      endColumn = result.endPosition.column + 1;
    } else if (params !== null) {
      endColumn = params.endPosition.column + 1;
    } else {
      endColumn = nameNode.endPosition.column + 1;
    }
  }

  return {
    kind: 'func',
    name,
    modifiers: '',
    signature,
    startLine,
    endLine,
    ...(startColumn !== undefined &&
      endColumn !== undefined && {
        startColumn,
        endColumn
      })
  };
}

type GoDeclarationParser = (node: SyntaxNodeType) => ParsedDeclaration[];

const GO_DECLARATION_PARSERS: Readonly<Record<string, GoDeclarationParser>> = {
  const_declaration: parseConstDeclarations,
  var_declaration: parseVarDeclarations,
  type_declaration: parseTypeDeclarations,
  function_declaration: (node) => {
    const parsed = parseFunctionDeclaration(node);
    return parsed !== null ? [parsed] : [];
  },
  method_declaration: (node) => {
    const parsed = parseFunctionDeclaration(node);
    return parsed !== null ? [parsed] : [];
  }
};

/**
 * Parses declarations from the Go AST.
 */
function parseGoDeclarations(content: string): ParsedDeclaration[] {
  const parser = createGoParser();
  const tree = parser.parse(content);
  const declarations: ParsedDeclaration[] = [];

  const rootNode = tree.rootNode;

  for (const node of rootNode.children) {
    const nodeType = node.type;

    // Skip comments
    if (
      nodeType === 'comment' ||
      nodeType === 'package_clause' ||
      nodeType === 'import_declaration'
    ) {
      continue;
    }

    const parser = GO_DECLARATION_PARSERS[nodeType];
    if (parser === undefined) {
      continue;
    }

    declarations.push(...parser(node));
  }

  return declarations;
}

/**
 * Checks if a comment line is a build tag or directive.
 * Build tags start with //go: or // +build
 */
function isBuildTagOrDirective(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//go:') || trimmed.startsWith('// +build');
}

/**
 * Checks if a line is a comment (starts with //).
 */
function isCommentLine(line: string): boolean {
  return line.trim().startsWith('//');
}

/**
 * Result of extracting header comment information.
 */
interface HeaderCommentResult {
  /** Raw comment lines with // prefix (for outline) */
  rawLines: string[];
  /** Joined comment text without // prefix (for summary) */
  joinedText: string;
  /** 1-based line number of the first comment line */
  startLine: number;
}

/**
 * Extracts the header comment that appears before the package clause.
 * Returns both raw lines (with //) and joined text (without //).
 * Skips build tags and directives.
 */
function extractHeaderComment(content: string): HeaderCommentResult | null {
  const lines = content.split('\n');
  const rawLines: string[] = [];
  let foundPackage = false;
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const trimmed = line.trim();

    // Stop when we hit the package clause
    if (trimmed.startsWith('package ')) {
      foundPackage = true;
      break;
    }

    // Skip empty lines (but continue looking for comments)
    if (trimmed === '') {
      continue;
    }

    // Skip build tags and directives
    if (isBuildTagOrDirective(trimmed)) {
      continue;
    }

    // Handle single-line comments
    if (isCommentLine(trimmed)) {
      // Track the first comment line number
      if (rawLines.length === 0) {
        startLine = i + 1; // 1-based
      }
      // Store the raw line (preserve original indentation/structure but trim whitespace)
      rawLines.push(trimmed);
      continue;
    }

    // If we hit non-comment, non-empty line before package, stop
    break;
  }

  if (!foundPackage || rawLines.length === 0) {
    return null;
  }

  // Extract text without // for summary
  const commentTexts = rawLines.map((line) => line.slice(2).trim());

  return {
    rawLines,
    joinedText: commentTexts.join(' '),
    startLine
  };
}

/**
 * Generates an outline from Go source content.
 * Extracts top-level const, var, type, and func declarations.
 */
function generateGoOutline(options: OutlineOptions): OutlineResult {
  const { filePath, content } = options;
  const declarations = parseGoDeclarations(content);

  // Extract header comment to include in outline
  const headerComment = extractHeaderComment(content);

  const lines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];

  lines.push(...buildHeaderCommentOutlineLines(headerComment));
  lines.push(...buildDeclarationOutlineLines(declarations));

  return createOutlineResult(lines, headerComment?.joinedText ?? null);
}

/**
 * Extracts a summary from Go source content.
 * Returns the header comment appearing before the package clause,
 * or null if no eligible comment exists.
 */
function extractGoSummary(content: string): { summary: string | null } {
  const headerComment = extractHeaderComment(content);
  return { summary: headerComment?.joinedText ?? null };
}

export const goLanguageEngine: OutlineLanguageEngine = {
  id: 'go',
  matchesFilePath: matchesGoFilePath,
  generateOutline: generateGoOutline,
  extractSummary: extractGoSummary
};
