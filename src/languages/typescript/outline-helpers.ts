/**
 * Shared helper functions for outline generation.
 * Pure utility functions used by multiple outline modules.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import {
  isFunctionNodeType,
  isFunctionSignatureNodeType,
  isClassNodeType,
  isVariableNodeType,
  isSingleDeclarationNodeType,
  isModuleNodeType
} from './ast-utils.js';

/**
 * Finds the export keyword in a parent export statement node.
 * @param parentNode - The parent export_statement node
 * @returns The export keyword node if found, undefined otherwise
 */
export function findExportKeyword(parentNode: SyntaxNodeType): SyntaxNodeType | undefined {
  return parentNode.children.find((child) => child.type === 'export');
}

/**
 * Calculates the column span for an exported declaration.
 * Returns the span from the export keyword (if present) to the end node.
 * @param parentNode - The parent export_statement node (for finding export keyword)
 * @param endNode - The node marking the end of the span
 * @param fallbackStartNode - Node to use for start position if no export keyword
 * @returns Object with startColumn and endColumn (1-based)
 */
export function calculateExportColumnSpan(
  parentNode: SyntaxNodeType,
  endNode: SyntaxNodeType,
  fallbackStartNode: SyntaxNodeType
): { startColumn: number; endColumn: number } {
  const exportKeyword = findExportKeyword(parentNode);
  return {
    startColumn:
      (exportKeyword
        ? exportKeyword.startPosition.column
        : fallbackStartNode.startPosition.column) + 1,
    endColumn: endNode.endPosition.column + 1
  };
}

/**
 * Checks if an export statement is a re-export list (export { foo, bar } from './module').
 * These should be skipped per the spec.
 */
export function isReExportList(node: SyntaxNodeType): boolean {
  return node.children.some((child) => child.type === 'export_clause');
}

/**
 * Determines the export modifiers for a declaration based on the export statement.
 * @param exportNode - The export statement node
 * @returns The modifiers string: 'export', 'export default', or '' for non-export
 */
export function getExportModifiers(exportNode: SyntaxNodeType): string {
  const hasDefault = exportNode.children.some((child) => child.type === 'default');
  return hasDefault ? 'export default' : 'export';
}

/**
 * Find the declaration child in an export statement.
 * This handles both named exports (where declaration is a field)
 * and default exports (where declaration is a direct child).
 * Also handles exported namespace/module declarations (internal_module, module).
 */
export function findExportDeclaration(node: SyntaxNodeType): SyntaxNodeType | null {
  // Try the field first
  const declField = node.childForFieldName('declaration');
  if (declField !== null) {
    return declField;
  }

  // For default exports, find the declaration-like child
  for (const child of node.children) {
    const childType = child.type;
    if (
      isFunctionNodeType(childType) ||
      isFunctionSignatureNodeType(childType) ||
      isClassNodeType(childType) ||
      isVariableNodeType(childType) ||
      isSingleDeclarationNodeType(childType) ||
      isModuleNodeType(childType)
    ) {
      return child;
    }
  }

  return null;
}
