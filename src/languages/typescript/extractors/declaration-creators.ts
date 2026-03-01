/**
 * Declaration creator functions for TypeScript AST nodes.
 * Pure factory functions that create ParsedDeclaration objects.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import type { ParsedDeclaration } from '../../../core/types.js';
import { getNodeLineRange, getDeclarationName, getDeclarationColumnSpan } from './node-utils.js';
import { getFunctionSignature } from './signature-builder.js';

/**
 * Creates a ParsedDeclaration for a function node.
 */
export function createFunctionDeclaration(
  node: SyntaxNodeType,
  modifiers: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration {
  const signature = getFunctionSignature(node);
  return buildBaseDeclaration(node, 'function', modifiers, signature, parentNode);
}

function buildBaseDeclaration(
  node: SyntaxNodeType,
  kind: string,
  modifiers: string,
  signature: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration {
  const name = getDeclarationName(node) ?? '';
  const { startLine, endLine } = getNodeLineRange(node, parentNode);
  const { startColumn, endColumn } = getDeclarationColumnSpan({
    node,
    signature,
    modifiers,
    kind,
    name,
    parentNode
  });
  return {
    kind,
    name,
    modifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

/**
 * Creates a ParsedDeclaration for a class node.
 */
export function createClassDeclaration(
  node: SyntaxNodeType,
  modifiers: string,
  isAbstract: boolean,
  parentNode?: SyntaxNodeType
): ParsedDeclaration {
  const kind = isAbstract ? 'abstract class' : 'class';
  return buildBaseDeclaration(node, kind, modifiers, '', parentNode);
}

/**
 * Creates a ParsedDeclaration for an interface node.
 */
export function createInterfaceDeclaration(
  node: SyntaxNodeType,
  modifiers: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration {
  return buildBaseDeclaration(node, 'interface', modifiers, '', parentNode);
}

/**
 * Creates a ParsedDeclaration for a type alias node.
 */
export function createTypeDeclaration(
  node: SyntaxNodeType,
  modifiers: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration {
  return buildBaseDeclaration(node, 'type', modifiers, '', parentNode);
}

/**
 * Creates a ParsedDeclaration for an enum node.
 */
export function createEnumDeclaration(
  node: SyntaxNodeType,
  modifiers: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration {
  const isConst = node.children.some((child) => child.type === 'const');
  const kind = isConst ? 'const enum' : 'enum';
  return buildBaseDeclaration(node, kind, modifiers, '', parentNode);
}
