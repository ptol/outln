/**
 * Namespace/module declaration extraction for TypeScript outline generation.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import type { ParsedDeclaration } from '../../../core/types.js';
import { getNodeLineRange } from './node-utils.js';

/**
 * Extracts the declaration info from a namespace/module declaration node.
 * Handles `namespace X {}` and `module Y {}`.
 */
export function extractNamespaceDeclaration(node: SyntaxNodeType): ParsedDeclaration {
  const { startLine, endLine } = getNodeLineRange(node);
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '';

  // Determine the keyword: internal_module = namespace, module = module
  const kind = node.type === 'internal_module' ? 'namespace' : 'module';

  // Calculate column span: from keyword through the name
  const keywordNode = node.children.find(
    (child) => child.type === 'namespace' || child.type === 'module'
  );
  const startColumn = (keywordNode?.startPosition.column ?? node.startPosition.column) + 1;
  const endColumn = (nameNode?.endPosition.column ?? node.endPosition.column) + 1;

  return {
    kind,
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}
