/**
 * Re-export statement extraction for TypeScript outline generation.
 * Handles `export { a as b }`, `export { x } from`, `export *`, `export * as ns from`,
 * `export =`, `export as namespace` and `export default <identifier>`.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import { normalizeWhitespace } from '../../../core/formatter.js';
import type { ParsedDeclaration } from '../../../core/types.js';
import { getNodeLineRange } from './node-utils.js';

/**
 * Child node types that mark an export statement as a re-export or export alias.
 */
const RE_EXPORT_MARKER_TYPES: ReadonlySet<string> = new Set([
  'export_clause',
  'namespace_export',
  '*',
  '=',
  'as'
]);

/**
 * Checks whether an export statement re-exports or aliases existing bindings
 * instead of declaring something new.
 * @param node - An `export_statement` node
 */
export function isReExportStatement(node: SyntaxNodeType): boolean {
  const childTypes = node.children.map((child) => child.type);
  const isDefaultIdentifier = childTypes.includes('default') && childTypes.includes('identifier');
  return isDefaultIdentifier || childTypes.some((type) => RE_EXPORT_MARKER_TYPES.has(type));
}

/**
 * Formats the statement text on one line, without the trailing semicolon.
 */
function formatReExportText(node: SyntaxNodeType): string {
  return normalizeWhitespace(node.text).replace(/\s*;$/, '');
}

/**
 * Creates a declaration for a re-export statement. The signature is the statement text;
 * the debug highlight covers the statement's first source line.
 * @param node - An `export_statement` node accepted by `isReExportStatement`
 */
export function extractReExportDeclaration(node: SyntaxNodeType): ParsedDeclaration {
  const { startLine, endLine } = getNodeLineRange(node);
  const firstSourceLine = node.text.split('\n')[0] ?? '';
  const startColumn = node.startPosition.column + 1;
  return {
    kind: 'export',
    name: '',
    modifiers: '',
    signature: formatReExportText(node),
    startLine,
    endLine,
    startColumn,
    endColumn: startColumn + firstSourceLine.length
  };
}
