/**
 * Class member extraction for TypeScript outline generation.
 * Extracts method-like members (constructor, methods, getters, setters) from class bodies.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import type { ParsedDeclaration } from '../../../core/types.js';
import { isClassMemberNodeType } from '../ast-utils.js';
import { getDeclarationColumnSpan } from './node-utils.js';

/**
 * Checks if a class member node type is supported for extraction.
 * Uses centralized node type constants from ast-utils.ts.
 * @param nodeType - The AST node type
 * @returns True if the node type represents a supported class member
 */
function isSupportedMemberType(nodeType: string): boolean {
  return isClassMemberNodeType(nodeType);
}

/**
 * Checks if a member name is computed (e.g., [Symbol.iterator]()).
 * Computed names should be skipped.
 * Only property_identifier and private_property_identifier are considered non-computed.
 * @param node - The member AST node
 * @returns True if the member has a computed name
 */
function hasComputedName(node: SyntaxNodeType): boolean {
  const nodeType = node.type;

  // Constructor never has a computed name
  if (nodeType === 'constructor') {
    return false;
  }

  const nameNode = node.childForFieldName('name');
  if (nameNode === null) {
    return true; // No name means we can't determine it - treat as computed to skip
  }

  // Only these types are non-computed identifiers
  return nameNode.type !== 'property_identifier' && nameNode.type !== 'private_property_identifier';
}

/**
 * Extracts the member name from a class member node.
 * Handles private identifiers (e.g., #touch), regular identifiers, and constructor.
 * @param node - The member AST node
 * @returns The member name or null if it cannot be determined
 */
function extractMemberName(node: SyntaxNodeType): string | null {
  const nodeType = node.type;

  // Constructor has no name field, its type identifies it
  if (nodeType === 'constructor') {
    return 'constructor';
  }

  const nameNode = node.childForFieldName('name');
  if (nameNode === null) {
    return null;
  }

  // Handle private identifiers (e.g., #touch)
  if (nameNode.type === 'private_property_identifier') {
    return nameNode.text;
  }

  // Handle regular property identifiers
  if (nameNode.type === 'property_identifier') {
    return nameNode.text;
  }

  return null;
}

/**
 * Extracts the parameters text from a method node.
 * @param node - The member AST node
 * @returns The parameters text including parentheses, or empty string
 */
function extractParameters(node: SyntaxNodeType): string {
  const paramsNode = node.childForFieldName('parameters');
  return paramsNode?.text ?? '()';
}

/**
 * Extracts the return type from a method node.
 * @param node - The member AST node
 * @returns The return type text including colon, or empty string
 */
function extractReturnType(node: SyntaxNodeType): string {
  const returnTypeNode = node.childForFieldName('return_type');
  return returnTypeNode?.text ?? '';
}

/**
 * Checks if a method definition is a getter.
 * @param node - The method definition AST node
 * @returns True if the method is a getter
 */
function isGetter(node: SyntaxNodeType): boolean {
  return node.children.some((child) => child.type === 'get');
}

/**
 * Checks if a method definition is a setter.
 * @param node - The method definition AST node
 * @returns True if the method is a setter
 */
function isSetter(node: SyntaxNodeType): boolean {
  return node.children.some((child) => child.type === 'set');
}

/**
 * Gets the child node that should be used as the start of the signature.
 * This skips modifiers like 'static', 'private', 'abstract' etc.
 * @param node - The member AST node
 * @param nodeType - The node type
 * @returns The node where the signature starts, or undefined if the node itself should be used
 */
function getSignatureStartNode(node: SyntaxNodeType, nodeType: string): SyntaxNodeType | undefined {
  // For constructor, find the 'constructor' keyword child
  if (nodeType === 'constructor') {
    return node.children.find((child) => child.type === 'constructor');
  }

  // For getters, find the 'get' keyword child
  if (nodeType === 'method_definition' && isGetter(node)) {
    return node.children.find((child) => child.type === 'get');
  }

  // For setters, find the 'set' keyword child
  if (nodeType === 'method_definition' && isSetter(node)) {
    return node.children.find((child) => child.type === 'set');
  }

  // For abstract methods, find the property_identifier child to skip 'abstract' keyword
  if (nodeType === 'abstract_method_signature') {
    return node.children.find(
      (child) =>
        child.type === 'property_identifier' || child.type === 'private_property_identifier'
    );
  }

  // For regular methods, find the property_identifier child to skip modifiers
  if (nodeType === 'method_definition') {
    return node.children.find(
      (child) =>
        child.type === 'property_identifier' || child.type === 'private_property_identifier'
    );
  }

  return undefined;
}

/**
 * Builds a compact signature for a class member.
 * - constructor: constructor(params)
 * - method: name(params): returnType
 * - getter: get name()
 * - setter: set name(params)
 * @param node - The member AST node
 * @param nodeType - The node type
 * @returns The formatted signature string
 */
function buildMemberSignature(node: SyntaxNodeType, nodeType: string): string {
  const parameters = extractParameters(node);

  if (nodeType === 'constructor') {
    return `constructor${parameters}`;
  }

  const name = extractMemberName(node);
  if (name === null) {
    return '';
  }

  // Check for accessor_pair type (older tree-sitter versions)
  if (nodeType === 'accessor_pair') {
    const getter = node.children.find((child) => child.type === 'get');
    const setter = node.children.find((child) => child.type === 'set');

    if (getter !== undefined) {
      return `get ${name}()`;
    }
    if (setter !== undefined) {
      return `set ${name}${parameters}`;
    }
    return '';
  }

  // method_definition - check for getter/setter modifiers
  if (isGetter(node)) {
    const returnType = extractReturnType(node);
    return `get ${name}()${returnType}`;
  }
  if (isSetter(node)) {
    return `set ${name}${parameters}`;
  }

  // Regular method
  const returnType = extractReturnType(node);
  return `${name}${parameters}${returnType}`;
}

/**
 * Gets the line range for a class member node.
 * @param node - The member AST node
 * @returns Object with startLine and endLine (1-based inclusive)
 */
function getMemberLineRange(node: SyntaxNodeType): { startLine: number; endLine: number } {
  return {
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1
  };
}

/**
 * Converts a class member AST node to a ParsedDeclaration.
 * @param node - The class member AST node
 * @returns The parsed declaration or null if the member should be skipped
 */
function convertMemberToDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const nodeType = node.type;

  if (!isSupportedMemberType(nodeType)) {
    return null;
  }

  // Skip computed names (e.g., [Symbol.iterator]())
  if (hasComputedName(node)) {
    return null;
  }

  const signature = buildMemberSignature(node, nodeType);
  if (signature.length === 0) {
    return null;
  }

  const { startLine, endLine } = getMemberLineRange(node);
  const name = extractMemberName(node) ?? '';

  // Determine member kind: constructor vs method (includes getters/setters)
  const kind: ParsedDeclaration['kind'] = nodeType === 'constructor' ? 'constructor' : 'method';

  // Calculate column span for debug mode highlighting
  // Find the proper start node to skip modifiers like 'static', 'private', 'abstract'
  const startNode = getSignatureStartNode(node, nodeType);
  const { startColumn, endColumn } = getDeclarationColumnSpan({
    node,
    signature,
    modifiers: '',
    kind,
    name,
    startNode
  });

  return {
    kind,
    name,
    modifiers: '',
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

/**
 * Emits a diagnostic for class-member extraction failures.
 */
function reportClassMemberExtractionError(node: SyntaxNodeType, error: unknown): void {
  const startLine = node.startPosition.row + 1;
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(
    `[outln] Failed to parse class member node type "${node.type}" at line ${startLine.toString()}: ${errorMessage}`
  );
}

/**
 * Extracts method-like members from a class body.
 * Supports: constructor, method_definition, accessor_pair (getter/setter).
 * Skips: fields/properties, computed names, static/private modifiers in output.
 * @param classNode - The class declaration AST node
 * @returns Array of parsed member declarations (empty if none found or on error)
 */
export function extractClassMembers(classNode: SyntaxNodeType): ParsedDeclaration[] {
  const members: ParsedDeclaration[] = [];

  // Find the class_body node
  const classBody = classNode.children.find((child) => child.type === 'class_body');
  if (classBody === undefined) {
    return members;
  }

  for (const child of classBody.children) {
    try {
      const parsed = convertMemberToDeclaration(child);
      if (parsed !== null) {
        members.push(parsed);
      }
    } catch (error) {
      reportClassMemberExtractionError(child, error);
      continue;
    }
  }

  return members;
}
