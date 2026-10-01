/**
 * Function signature building utilities for TypeScript outline generation.
 * Constructs function signatures from AST node components.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

/**
 * Returns the source text of a node's type parameter list (e.g. `<T extends number>`), or ''.
 */
export function getTypeParametersText(node: SyntaxNodeType): string {
  return node.childForFieldName('type_parameters')?.text ?? '';
}

/**
 * Builds a `kind Name<T>` signature for generic classes, interfaces and type aliases.
 * Returns '' for non-generic declarations so the default `kind name` rendering is used.
 * @param kind - Declaration kind (e.g. 'class', 'declare interface')
 * @param name - Declaration name
 * @param node - Declaration node that may carry type parameters
 */
export function buildGenericTypeSignature(
  kind: string,
  name: string,
  node: SyntaxNodeType
): string {
  const typeParameters = getTypeParametersText(node);
  if (typeParameters.length === 0) {
    return '';
  }
  return name.length > 0 ? `${kind} ${name}${typeParameters}` : `${kind}${typeParameters}`;
}

/**
 * Builds a function signature string from parts.
 * @param prefix - The prefix to use (e.g., 'function' or 'declare function')
 * @param name - The function name
 * @param signatureNode - Node carrying the type parameters, parameters and return type fields
 * @returns The complete signature string
 */
export function buildFunctionSignature(
  prefix: string,
  name: string,
  signatureNode: SyntaxNodeType
): string {
  const parameters = signatureNode.childForFieldName('parameters');
  const returnType = signatureNode.childForFieldName('return_type');
  let signature = `${prefix} ${name}${getTypeParametersText(signatureNode)}`;
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

  let signatureRest = getTypeParametersText(node);
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
