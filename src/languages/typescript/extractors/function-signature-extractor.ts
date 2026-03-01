/**
 * Function signature declaration extraction for TypeScript outline generation.
 * Handles function overload signatures (without body).
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import type { ParsedDeclaration } from '../../../core/types.js';
import { getNodeLineRange, getDeclarationColumnSpan } from './node-utils.js';
import { buildFunctionSignature } from './signature-builder.js';

/**
 * Extracts the declaration info from a function signature node (overload).
 */
export function extractFunctionSignatureDeclaration(node: SyntaxNodeType): ParsedDeclaration {
  const { startLine, endLine } = getNodeLineRange(node);
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '';
  const parameters = node.childForFieldName('parameters');
  const returnType = node.childForFieldName('return_type');

  const signature = buildFunctionSignature('function', name, parameters, returnType);
  const { startColumn, endColumn } = getDeclarationColumnSpan({
    node,
    signature,
    modifiers: '',
    kind: 'function',
    name
  });

  return {
    kind: 'function',
    name,
    modifiers: '',
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}
