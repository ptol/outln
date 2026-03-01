/**
 * AST node line range utilities for outline generation.
 * Provides helpers for calculating declaration line ranges including decorators.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

/**
 * Finds the minimum start line among all decorators in the given node.
 * Returns the node's start line if no decorators are found.
 * @param node - The node to check for decorators
 * @returns The 1-based line number of the first decorator or the node's start line
 */
function getStartLineWithDecorators(node: SyntaxNodeType): number {
  let minLine = node.startPosition.row + 1;
  for (const child of node.children) {
    if (child.type === 'decorator') {
      const decoratorLine = child.startPosition.row + 1;
      if (decoratorLine < minLine) {
        minLine = decoratorLine;
      }
    }
  }
  return minLine;
}

/**
 * Gets the line range (1-based inclusive) from a syntax node,
 * including any decorator lines that precede the declaration.
 * @param node - The AST node to get line range for
 * @param parentNode - Optional parent node that may contain decorators (e.g., export_statement)
 * @returns The 1-based inclusive start and end line numbers
 */
export function getNodeLineRange(
  node: SyntaxNodeType,
  parentNode?: SyntaxNodeType
): { startLine: number; endLine: number } {
  // Check for decorators in both the node itself and the parent node
  let startLine = getStartLineWithDecorators(node);
  if (parentNode !== undefined) {
    const parentStartLine = getStartLineWithDecorators(parentNode);
    if (parentStartLine < startLine) {
      startLine = parentStartLine;
    }
  }
  return {
    startLine,
    endLine: node.endPosition.row + 1
  };
}

/**
 * Get the name from a declaration node (class, interface, type, enum).
 */
export function getDeclarationName(node: SyntaxNodeType): string | null {
  const nameNode = node.children.find(
    (child) => child.type === 'type_identifier' || child.type === 'identifier'
  );
  return nameNode?.text ?? null;
}

/**
 * Builds a unique key from a line range for matching declarations to AST nodes.
 * Format: "startLine-endLine" (e.g., "10-25")
 * @param startLine - The 1-based start line number
 * @param endLine - The 1-based end line number
 * @returns A string key representing the line range
 */
export function buildLineRangeKey(startLine: number, endLine: number): string {
  return `${startLine.toString()}-${endLine.toString()}`;
}

/**
 * Gets the basic line range (1-based inclusive) from a syntax node.
 * Simple version without decorator support, useful for language engines
 * that don't have decorator concepts (like Go).
 * @param node - The AST node to get line range for
 * @returns The 1-based inclusive start and end line numbers
 */
export function getNodeLineRangeBasic(node: SyntaxNodeType): {
  startLine: number;
  endLine: number;
} {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1
  };
}

/**
 * Gets the column span for a subsequent variable declarator.
 * For non-first declarators, the span is exactly the identifier name.
 * @param nameNode - The identifier node for the declarator
 * @returns The 1-based inclusive start column and exclusive end column
 */
export function getDeclaratorColumnSpan(nameNode: SyntaxNodeType): {
  startColumn: number;
  endColumn: number;
} {
  const startColumn = nameNode.startPosition.column + 1;
  const endColumn = startColumn + nameNode.text.length;
  return { startColumn, endColumn };
}

/**
 * Parameters for getting declaration column span.
 */
export interface ColumnSpanParams {
  /** The declaration node */
  node: SyntaxNodeType;
  /** The computed signature string (empty if using kind + name) */
  signature: string;
  /** The export modifiers ('', 'export', or 'export default') */
  modifiers: string;
  /** The declaration kind (e.g., 'class', 'interface', 'function') */
  kind: string;
  /** The declaration name */
  name: string;
  /** Optional parent node (e.g., export_statement) that contains modifiers */
  parentNode?: SyntaxNodeType | undefined;
  /** Optional node to use for start position (e.g., ambient_declaration for 'declare' keyword) */
  startNode?: SyntaxNodeType | undefined;
}

/**
 * Gets the column span for a declaration's signature highlighting.
 * Returns 1-based column positions for the start and end of the signature text.
 * @param params - The column span parameters
 * @returns The 1-based inclusive start column and exclusive end column
 */
export function getDeclarationColumnSpan(params: ColumnSpanParams): {
  startColumn: number;
  endColumn: number;
} {
  const { node, signature, modifiers, kind, name, parentNode, startNode } = params;

  let actualStartNode: SyntaxNodeType;
  if (startNode !== undefined) {
    actualStartNode = startNode;
  } else if (modifiers.length > 0 && parentNode !== undefined) {
    actualStartNode = parentNode;
  } else {
    actualStartNode = node;
  }
  const lineStartIndex = actualStartNode.startPosition.column;

  let effectiveSignature: string;
  if (signature.length > 0) {
    effectiveSignature = signature;
  } else if (name.length > 0) {
    effectiveSignature = `${kind} ${name}`;
  } else {
    effectiveSignature = kind;
  }

  const prefix = modifiers.length > 0 ? `${modifiers} ` : '';
  const fullSignature = prefix + effectiveSignature;

  const endColumn = lineStartIndex + fullSignature.length + 1;

  return {
    startColumn: lineStartIndex + 1,
    endColumn
  };
}
