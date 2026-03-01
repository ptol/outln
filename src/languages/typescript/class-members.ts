/**
 * Class member attachment for parsed declarations.
 * Matches class declarations to their AST nodes and extracts members.
 */

import type { SyntaxNode as SyntaxNodeType } from 'tree-sitter';
import type Parser from 'tree-sitter';

import type { ParsedDeclaration } from '../../core/types.js';
import { extractClassMembers } from './extractors/class-member-extractor.js';
import { isClassNodeType } from './ast-utils.js';
import { buildLineRangeKey, getNodeLineRange } from './extractors/node-utils.js';
import { findExportDeclaration } from './outline-helpers.js';

/**
 * Checks if a declaration kind represents a class type.
 * @param kind - The declaration kind
 * @returns True if the kind is a class or abstract class
 */
function isClassKind(kind: string): boolean {
  return kind === 'class' || kind === 'abstract class';
}

/**
 * Builds a map of class nodes by their line range for matching.
 * @param rootNode - The root AST node to scan for classes
 * @returns Map from line range key to class node
 */
function buildClassNodeMap(rootNode: SyntaxNodeType): Map<string, SyntaxNodeType> {
  const classNodeMap = new Map<string, SyntaxNodeType>();

  for (const node of rootNode.children) {
    const nodeType = node.type;
    if (isClassNodeType(nodeType)) {
      const { startLine, endLine } = getNodeLineRange(node);
      classNodeMap.set(buildLineRangeKey(startLine, endLine), node);
    }
    // Handle exported classes
    if (nodeType === 'export_statement') {
      const declaration = findExportDeclaration(node);
      if (declaration !== null && isClassNodeType(declaration.type)) {
        const { startLine, endLine } = getNodeLineRange(declaration, node);
        classNodeMap.set(buildLineRangeKey(startLine, endLine), declaration);
      }
    }
  }

  return classNodeMap;
}

/**
 * Attaches member declarations to class declarations.
 * Iterates through parsed declarations and for each class,
 * extracts its members from the original AST and attaches them.
 * @param declarations - Array of parsed declarations
 * @param tree - Pre-parsed AST tree (avoids redundant re-parsing)
 * @returns Declarations with members attached to classes
 */
export function attachClassMembers(
  declarations: ParsedDeclaration[],
  tree: Parser.Tree
): ParsedDeclaration[] {
  const classNodeMap = buildClassNodeMap(tree.rootNode);

  // Attach members to each class declaration
  for (const declaration of declarations) {
    if (isClassKind(declaration.kind)) {
      const classNode = classNodeMap.get(
        buildLineRangeKey(declaration.startLine, declaration.endLine)
      );
      if (classNode !== undefined) {
        const members = extractClassMembers(classNode);
        if (members.length > 0) {
          declaration.members = members;
        }
      }
    }
  }

  return declarations;
}
