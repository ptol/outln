/**
 * Import alias extraction for TypeScript outline generation.
 * Handles `import Alias = require('...')` and `import Alias = ns.member`.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import type { ParsedDeclaration } from '../../../core/types.js';
import { getNodeLineRange } from './node-utils.js';

/**
 * Extracts the declaration info from an import alias node.
 * Handles `import Alias = require('...')` and `import Alias = ns.member`.
 * Returns null if no identifier is found (should not happen in valid code).
 */
export function extractImportAliasDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);

  // Find the import keyword and identifier
  const importKeyword = node.children.find((child) => child.type === 'import');
  const identifier = node.children.find((child) => child.type === 'identifier');
  if (identifier !== undefined) {
    const startColumn = (importKeyword?.startPosition.column ?? node.startPosition.column) + 1;
    const endColumn = identifier.endPosition.column + 1;
    return {
      kind: 'import',
      name: identifier.text,
      modifiers: '',
      signature: '',
      startLine,
      endLine,
      startColumn,
      endColumn
    };
  }

  return null;
}
