/**
 * Ambient declaration extraction for TypeScript outline generation.
 * Handles declare function, declare class, declare const, etc.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import type { ParsedDeclaration } from '../../../core/types.js';
import { getNodeLineRange, getDeclarationName, getDeclarationColumnSpan } from './node-utils.js';
import { buildFunctionSignature } from './signature-builder.js';

/**
 * Mapping from AST node types to their corresponding declaration kinds.
 * Used for simple name-based ambient declarations.
 */
const AMBIENT_DECLARATION_KINDS: Record<string, ParsedDeclaration['kind']> = {
  class_declaration: 'declare class',
  abstract_class_declaration: 'declare abstract class',
  enum_declaration: 'declare enum',
  interface_declaration: 'declare interface',
  type_alias_declaration: 'declare type',
  module: 'declare module',
  internal_module: 'declare namespace'
};

/**
 * Creates a single ParsedDeclaration for ambient declarations that only need a name.
 * @param kind - The declaration kind
 * @param name - The declaration name
 * @param startLine - The start line number
 * @param endLine - The end line number
 * @param startColumn - Optional start column (1-based inclusive)
 * @param endColumn - Optional end column (1-based exclusive)
 * @returns Array with a single ParsedDeclaration
 */
function createAmbientDeclaration(
  kind: ParsedDeclaration['kind'],
  name: string,
  startLine: number,
  endLine: number,
  startColumn?: number,
  endColumn?: number
): ParsedDeclaration[] {
  const decl: ParsedDeclaration = {
    kind,
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine
  };
  if (startColumn !== undefined && endColumn !== undefined) {
    decl.startColumn = startColumn;
    decl.endColumn = endColumn;
  }
  return [decl];
}

/**
 * Extracts variable declarators from a lexical_declaration or variable_declaration node.
 * Used for declare const, declare let, and declare var declarations.
 * @param node - The declaration node (lexical_declaration or variable_declaration)
 * @param kind - The declaration kind to use for each declarator
 * @param startLine - The start line for all declarators
 * @param endLine - The end line for all declarators
 * @param ambientNode - The ambient_declaration node (for 'declare' keyword positioning)
 * @returns Array of parsed declarations, one per declarator
 */
function extractAmbientVariableDeclarators(
  node: SyntaxNodeType,
  kind: ParsedDeclaration['kind'],
  startLine: number,
  endLine: number,
  ambientNode?: SyntaxNodeType
): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  let isFirstDeclarator = true;
  for (const declarator of node.children) {
    if (declarator.type === 'variable_declarator') {
      const nameNode = declarator.childForFieldName('name');
      if (nameNode !== null) {
        let startColumn: number;
        let endColumn: number;

        if (isFirstDeclarator) {
          // First declarator: use getDeclarationColumnSpan with ambientNode to include 'declare' keyword
          const span = getDeclarationColumnSpan({
            node: node,
            signature: '',
            modifiers: '',
            kind,
            name: nameNode.text,
            startNode: ambientNode
          });
          startColumn = span.startColumn;
          endColumn = span.endColumn;
        } else {
          // Subsequent declarators: span is exactly the identifier name
          // The declarator node starts at the identifier position
          const nameStartColumn = declarator.startPosition.column;
          startColumn = nameStartColumn + 1; // Convert to 1-based
          endColumn = startColumn + nameNode.text.length;
        }

        declarations.push({
          kind,
          name: nameNode.text,
          modifiers: '',
          signature: '',
          startLine,
          endLine,
          startColumn,
          endColumn
        });
        isFirstDeclarator = false;
      }
    }
  }
  return declarations;
}

/**
 * Extracts the declaration info from an ambient_declaration node.
 * Handles declare function, declare class, declare const, declare global, declare module.
 * Returns an array because declare const can have multiple declarators.
 */
export function extractAmbientDeclaration(node: SyntaxNodeType): ParsedDeclaration[] {
  const { startLine, endLine } = getNodeLineRange(node);

  // Find the actual declaration inside the ambient_declaration
  for (const child of node.children) {
    const childType = child.type;

    // declare function - contains function_signature
    if (childType === 'function_signature') {
      const nameNode = child.childForFieldName('name');
      const name = nameNode?.text ?? '';
      const parameters = child.childForFieldName('parameters');
      const returnType = child.childForFieldName('return_type');
      const signature = buildFunctionSignature('declare function', name, parameters, returnType);
      // Pass the ambient_declaration node as startNode to include 'declare' keyword
      const { startColumn, endColumn } = getDeclarationColumnSpan({
        node: child,
        signature,
        modifiers: '',
        kind: 'function',
        name,
        startNode: node // ambient_declaration node provides the 'declare' start position
      });
      return createAmbientDeclaration(
        'declare function',
        name,
        startLine,
        endLine,
        startColumn,
        endColumn
      ).map((decl) => ({
        ...decl,
        signature
      }));
    }

    // declare const/let - contains lexical_declaration with potentially multiple declarators
    if (childType === 'lexical_declaration') {
      const hasLet = child.children.some((c) => c.type === 'let');
      const kind: ParsedDeclaration['kind'] = hasLet ? 'declare let' : 'declare const';
      return extractAmbientVariableDeclarators(child, kind, startLine, endLine, node);
    }

    // declare var - variable_declaration node
    if (childType === 'variable_declaration') {
      return extractAmbientVariableDeclarators(child, 'declare var', startLine, endLine, node);
    }

    // declare global - statement_block with no name
    if (childType === 'statement_block') {
      // Calculate column span for 'declare global' keywords
      const { startColumn, endColumn } = getDeclarationColumnSpan({
        node: child,
        signature: '',
        modifiers: '',
        kind: 'declare global',
        name: '',
        startNode: node // ambient_declaration node provides the 'declare' start position
      });
      return createAmbientDeclaration(
        'declare global',
        '',
        startLine,
        endLine,
        startColumn,
        endColumn
      );
    }

    // Handle simple name-based declarations (class, enum, interface, type, module, namespace)
    const kind = AMBIENT_DECLARATION_KINDS[childType];
    if (kind !== undefined) {
      const name =
        childType === 'module' || childType === 'internal_module'
          ? (child.childForFieldName('name')?.text ?? '')
          : (getDeclarationName(child) ?? '');
      // Pass the ambient_declaration node as startNode to include 'declare' keyword
      // Use the full kind (e.g., "declare interface") for correct signature length
      const { startColumn, endColumn } = getDeclarationColumnSpan({
        node: child,
        signature: '',
        modifiers: '',
        kind, // Use full kind with "declare" prefix
        name,
        startNode: node // ambient_declaration node provides the 'declare' start position
      });
      return createAmbientDeclaration(kind, name, startLine, endLine, startColumn, endColumn);
    }
  }

  // Fallback: return a generic ambient declaration
  return createAmbientDeclaration('declare global', '', startLine, endLine);
}
