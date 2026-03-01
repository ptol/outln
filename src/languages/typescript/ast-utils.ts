/**
 * AST node type constants and checking utilities for script outline generation.
 * Centralizes tree-sitter AST node type definitions to avoid duplication.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

// ============================================================================
// Node Type Constants
// ============================================================================

/**
 * AST node types that represent function declarations.
 */
const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'generator_function_declaration',
  'generator_function',
  'function_expression'
]);

/**
 * AST node types that represent function signatures (declaration without body).
 * These are used for function overload signatures.
 */
const FUNCTION_SIGNATURE_NODE_TYPES = new Set(['function_signature']);

/**
 * AST node types that represent ambient declarations (declare keyword).
 */
const AMBIENT_NODE_TYPES = new Set(['ambient_declaration']);

/**
 * AST node types that represent namespace/module declarations.
 */
const MODULE_NODE_TYPES = new Set(['internal_module', 'module']);

/**
 * AST node types that represent class declarations.
 */
const CLASS_NODE_TYPES = new Set(['class_declaration', 'abstract_class_declaration', 'class']);

/**
 * AST node types that represent single-declaration entities
 * (excluding functions, classes, and variables which need special handling).
 */
const SINGLE_DECLARATION_NODE_TYPES = new Set([
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration'
]);

/**
 * AST node types that represent variable declarations.
 */
const VARIABLE_NODE_TYPES = new Set(['lexical_declaration', 'variable_declaration']);

/**
 * AST node types that indicate a nested declaration context.
 */
const NESTED_CONTEXT_NODE_TYPES = new Set(['class_body', 'statement_block', 'function_body']);

/**
 * AST node types that represent supported class members.
 * Used for extracting class member declarations in outline generation.
 */
const CLASS_MEMBER_NODE_TYPES = new Set([
  'constructor',
  'method_definition',
  'abstract_method_signature',
  'accessor_pair'
]);

// ============================================================================
// Node Type Checkers
// ============================================================================

/**
 * Generic node type checker factory.
 * Creates a function that checks if a node type is in the given set.
 */
function createNodeTypeChecker(types: Set<string>): (nodeType: string) => boolean {
  return (nodeType: string): boolean => types.has(nodeType);
}

/**
 * Check if a node type represents a function declaration.
 */
export const isFunctionNodeType = createNodeTypeChecker(FUNCTION_NODE_TYPES);

/**
 * Check if a node type represents a function signature (overload without body).
 */
export const isFunctionSignatureNodeType = createNodeTypeChecker(FUNCTION_SIGNATURE_NODE_TYPES);

/**
 * Check if a node type represents an ambient declaration.
 */
export const isAmbientNodeType = createNodeTypeChecker(AMBIENT_NODE_TYPES);

/**
 * Check if a node type represents a namespace/module declaration.
 */
export const isModuleNodeType = createNodeTypeChecker(MODULE_NODE_TYPES);

/**
 * Check if a node type represents a class declaration.
 */
export const isClassNodeType = createNodeTypeChecker(CLASS_NODE_TYPES);

/**
 * Check if a node type represents a variable declaration.
 */
export const isVariableNodeType = createNodeTypeChecker(VARIABLE_NODE_TYPES);

/**
 * Check if a node type represents a supported class member.
 */
export const isClassMemberNodeType = createNodeTypeChecker(CLASS_MEMBER_NODE_TYPES);

/**
 * Check if a node is a top-level declaration (not nested inside another declaration).
 */
export function isTopLevelDeclaration(node: SyntaxNodeType): boolean {
  let parent: SyntaxNodeType | null = node.parent;
  while (parent !== null) {
    if (NESTED_CONTEXT_NODE_TYPES.has(parent.type)) {
      return false;
    }
    parent = parent.parent;
  }
  return true;
}

/**
 * Check if a node type represents a single-declaration entity
 * (interface, type alias, or enum).
 */
export function isSingleDeclarationNodeType(nodeType: string): boolean {
  return SINGLE_DECLARATION_NODE_TYPES.has(nodeType);
}

// ============================================================================
// Node Type to Declaration Kind Mapping
// ============================================================================

/**
 * Mapping from AST node types to their corresponding declaration kinds.
 * Centralizes the type-to-kind relationship for consistent naming across the codebase.
 */
export const NODE_TYPE_TO_KIND_MAP: Readonly<Record<string, string>> = {
  class_declaration: 'class',
  abstract_class_declaration: 'abstract class',
  class: 'class',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum'
};

/**
 * Gets the declaration kind for a given AST node type.
 * @param nodeType - The AST node type
 * @returns The declaration kind, or undefined if not a known declaration type
 */
export function getDeclarationKind(nodeType: string): string | undefined {
  return NODE_TYPE_TO_KIND_MAP[nodeType];
}
