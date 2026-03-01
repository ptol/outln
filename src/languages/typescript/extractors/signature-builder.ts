/**
 * Function signature building utilities for TypeScript outline generation.
 * Constructs function signatures from AST node components.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

/**
 * Builds a function signature string from parts.
 * @param prefix - The prefix to use (e.g., 'function' or 'declare function')
 * @param name - The function name
 * @param parameters - The parameters node, or null
 * @param returnType - The return type node, or null
 * @returns The complete signature string
 */
export function buildFunctionSignature(
  prefix: string,
  name: string,
  parameters: SyntaxNodeType | null,
  returnType: SyntaxNodeType | null
): string {
  let signature = `${prefix} ${name}`;
  if (parameters !== null) {
    signature += parameters.text;
  }
  if (returnType !== null) {
    signature += returnType.text;
  }
  return signature;
}

/**
 * Extract function signature (parameters and return type) without the body.
 * Preserves original spacing from the source.
 */
export function getFunctionSignature(node: SyntaxNodeType): string {
  let prefix = '';
  let name = '';
  let hasFunction = false;

  for (const child of node.children) {
    const childType = child.type;
    if (childType === 'async') {
      prefix = 'async ';
    } else if (childType === '*') {
      prefix += 'function*';
      hasFunction = true;
    } else if (childType === 'identifier') {
      name = child.text;
    }
  }

  if (!hasFunction) {
    prefix += 'function';
  }

  const parameters = node.childForFieldName('parameters');
  const returnType = node.childForFieldName('return_type');

  let signatureRest = '';
  if (parameters !== null) {
    signatureRest += parameters.text;
  }
  if (returnType !== null) {
    signatureRest += returnType.text;
  }

  if (name.length > 0) {
    return `${prefix} ${name}${signatureRest}`;
  }
  return `${prefix}${signatureRest}`;
}
