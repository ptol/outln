/**
 * AST traversal and declaration extraction for TypeScript/JavaScript sources.
 */

import type Parser from 'tree-sitter';
import { type SyntaxNode as SyntaxNodeType } from 'tree-sitter';

import {
  getDeclarationKind,
  isClassNodeType,
  isFunctionNodeType,
  isFunctionSignatureNodeType,
  isModuleNodeType,
  isSingleDeclarationNodeType,
  isTopLevelDeclaration,
  isVariableNodeType
} from './ast-utils.js';
import {
  createClassDeclaration,
  createEnumDeclaration,
  createFunctionDeclaration,
  createInterfaceDeclaration,
  createTypeDeclaration,
  extractAmbientDeclaration,
  extractFunctionSignatureDeclaration,
  extractImportAliasDeclaration,
  extractNamespaceDeclaration,
  getNodeLineRange,
  getDeclarationColumnSpan,
  getDeclaratorColumnSpan
} from './extractors.js';
import {
  findExportDeclaration,
  getExportModifiers,
  isReExportList,
  calculateExportColumnSpan
} from './outline-helpers.js';
import type { ParsedDeclaration } from '../../core/types.js';
import type { ParseDependencies } from './parse-types.js';

/**
 * Type for a function that handles a specific AST node type and extracts declarations.
 */
type NodeHandler = (node: SyntaxNodeType) => ParsedDeclaration[];

/**
 * Converts import statement nodes to declarations.
 * Handles import X = require() syntax.
 */
function convertImportDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const importRequireClause = node.children.find((child) => child.type === 'import_require_clause');
  if (importRequireClause === undefined) {
    return [];
  }

  const nameNode = importRequireClause.children.find((child) => child.type === 'identifier');
  if (nameNode === undefined) {
    return [];
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const importKeyword = node.children.find((child) => child.type === 'import');
  const startColumn = (importKeyword?.startPosition.column ?? node.startPosition.column) + 1;
  const endColumn = nameNode.endPosition.column + 1;

  return [
    {
      kind: 'import',
      name: nameNode.text,
      modifiers: '',
      signature: '',
      startLine,
      endLine,
      startColumn,
      endColumn
    }
  ];
}

/**
 * Converts expression statement nodes to declarations.
 * Handles namespace X {} declarations.
 */
function convertExpressionStatementDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const internalModule = node.children.find((child) => child.type === 'internal_module');
  if (internalModule === undefined) {
    return [];
  }
  return [extractNamespaceDeclaration(internalModule)];
}

/**
 * Converts import alias nodes to declarations.
 * Handles import Alias = ns.member syntax.
 */
function convertImportAliasDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const importAlias = extractImportAliasDeclaration(node);
  return importAlias !== null ? [importAlias] : [];
}

/**
 * Converts export statement nodes to declarations.
 */
function convertExportDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  return processExportStatement(node);
}

/**
 * Converts ambient declaration nodes to declarations.
 */
function convertAmbientDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  return extractAmbientDeclaration(node);
}

/**
 * Converts namespace/module declaration nodes to declarations.
 */
function convertModuleDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  return [extractNamespaceDeclaration(node)];
}

/**
 * Converts a single AST node to a ParsedDeclaration.
 * Uses centralized predicates from ast-utils for type checking.
 */
function convertNodeToDeclaration(
  node: SyntaxNodeType,
  modifiers: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration | null {
  const nodeType = node.type;

  if (isFunctionNodeType(nodeType)) {
    return createFunctionDeclaration(node, modifiers, parentNode);
  }

  if (isFunctionSignatureNodeType(nodeType)) {
    const decl = extractFunctionSignatureDeclaration(node);
    decl.modifiers = modifiers;
    return decl;
  }

  if (isClassNodeType(nodeType)) {
    if (nodeType === 'class') {
      const { startLine, endLine } = getNodeLineRange(node, parentNode);
      const decl: ParsedDeclaration = {
        kind: 'class',
        name: '',
        modifiers,
        signature: '',
        startLine,
        endLine
      };

      if (modifiers === 'export default' && parentNode !== undefined) {
        const classKeyword = node.children.find((child) => child.type === 'class');
        if (classKeyword !== undefined) {
          const span = calculateExportColumnSpan(parentNode, classKeyword, node);
          decl.startColumn = span.startColumn;
          decl.endColumn = span.endColumn;
        }
      }

      return decl;
    }

    const isAbstract = nodeType === 'abstract_class_declaration';
    return createClassDeclaration(node, modifiers, isAbstract, parentNode);
  }

  if (isSingleDeclarationNodeType(nodeType)) {
    const kind = getDeclarationKind(nodeType);
    if (kind === 'interface') {
      return createInterfaceDeclaration(node, modifiers, parentNode);
    }
    if (kind === 'type') {
      return createTypeDeclaration(node, modifiers, parentNode);
    }
    if (kind === 'enum') {
      return createEnumDeclaration(node, modifiers, parentNode);
    }
  }

  return null;
}

/**
 * Determines the variable kind (const/let/var) from a lexical or variable declaration node.
 */
function getVariableKind(node: SyntaxNodeType): 'const' | 'let' | 'var' | null {
  if (node.type === 'variable_declaration') {
    return 'var';
  }

  if (node.type !== 'lexical_declaration') {
    return null;
  }

  const kindNode = node.children.find((c) => c.type === 'const' || c.type === 'let');
  if (kindNode?.type === 'const') {
    return 'const';
  }
  if (kindNode?.type === 'let') {
    return 'let';
  }
  return null;
}

/**
 * Parses variable declarations from a lexical_declaration or variable_declaration node.
 */
function parseVariableDeclarationNode(
  node: SyntaxNodeType,
  modifiers: string,
  parentNode?: SyntaxNodeType
): ParsedDeclaration[] {
  const kind = getVariableKind(node);
  if (kind === null) {
    return [];
  }

  const declarations: ParsedDeclaration[] = [];
  const { startLine, endLine } = getNodeLineRange(node, parentNode);
  let isFirstDeclarator = true;

  for (const child of node.children) {
    if (child.type === 'variable_declarator') {
      const nameNode = child.childForFieldName('name');
      if (nameNode !== null && nameNode.type === 'identifier') {
        let startColumn: number;
        let endColumn: number;

        if (isFirstDeclarator) {
          const span = getDeclarationColumnSpan({
            node,
            signature: '',
            modifiers,
            kind,
            name: nameNode.text,
            parentNode
          });
          startColumn = span.startColumn;
          endColumn = span.endColumn;
        } else {
          const span = getDeclaratorColumnSpan(nameNode);
          startColumn = span.startColumn;
          endColumn = span.endColumn;
        }

        const declaratorLine = nameNode.startPosition.row + 1;

        declarations.push({
          kind,
          name: nameNode.text,
          modifiers,
          signature: '',
          startLine,
          endLine,
          startColumn,
          endColumn,
          declaratorLine
        });
        isFirstDeclarator = false;
      }
    }
  }

  return declarations;
}

/**
 * Process an export statement and extract declarations from it.
 */
function processExportStatement(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];

  if (isReExportList(node)) {
    return declarations;
  }

  const declaration = findExportDeclaration(node);

  if (declaration === null) {
    return declarations;
  }

  if (!isTopLevelDeclaration(declaration)) {
    return declarations;
  }

  const modifiers = getExportModifiers(node);

  if (isVariableNodeType(declaration.type)) {
    declarations.push(...parseVariableDeclarationNode(declaration, modifiers, node));
    return declarations;
  }

  if (isModuleNodeType(declaration.type)) {
    const { startLine, endLine } = getNodeLineRange(declaration, node);
    const nameNode = declaration.childForFieldName('name');
    const name = nameNode?.text ?? '';
    const kind = declaration.type === 'internal_module' ? 'namespace' : 'module';

    const span = calculateExportColumnSpan(node, nameNode ?? declaration, declaration);
    declarations.push({
      kind,
      name,
      modifiers,
      signature: '',
      startLine,
      endLine,
      startColumn: span.startColumn,
      endColumn: span.endColumn
    });
    return declarations;
  }

  const parsed = convertNodeToDeclaration(declaration, modifiers, node);
  if (parsed !== null) {
    declarations.push(parsed);
  }

  return declarations;
}

/**
 * Mapping from AST node types to their dedicated handlers.
 */
const DEDICATED_HANDLERS: Readonly<Record<string, NodeHandler>> = {
  import_statement: convertImportDeclarations,
  expression_statement: convertExpressionStatementDeclarations,
  import_alias: convertImportAliasDeclarations,
  export_statement: convertExportDeclarations,
  ambient_declaration: convertAmbientDeclarations,
  internal_module: convertModuleDeclarations,
  module: convertModuleDeclarations
};

/**
 * Extracts declarations from general top-level declaration nodes.
 */
function extractTopLevelDeclaration(node: SyntaxNodeType): ParsedDeclaration[] {
  const nodeType = node.type;

  if (isFunctionSignatureNodeType(nodeType)) {
    return [extractFunctionSignatureDeclaration(node)];
  }

  if (isVariableNodeType(nodeType)) {
    return parseVariableDeclarationNode(node, '');
  }

  const parsed = convertNodeToDeclaration(node, '');
  return parsed !== null ? [parsed] : [];
}

/**
 * Result of parsing declarations with the parsed AST tree.
 * Used internally to avoid redundant re-parsing.
 */
export interface ParseResult {
  /** Parsed declarations extracted from the source */
  declarations: ParsedDeclaration[];
  /** The parsed AST tree for further analysis */
  tree: Parser.Tree;
}

/**
 * Parses script source and returns both declarations and the parsed tree.
 */
export function parseDeclarationsWithTree(
  content: string,
  dependencies: ParseDependencies
): ParseResult {
  const parser = dependencies.createParser();
  const tree = parser.parse(content);
  const declarations: ParsedDeclaration[] = [];

  const rootNode = tree.rootNode;

  for (const node of rootNode.children) {
    const nodeType = node.type;

    if (nodeType === 'comment') {
      continue;
    }

    const handler = DEDICATED_HANDLERS[nodeType];
    if (handler !== undefined) {
      declarations.push(...handler(node));
      continue;
    }

    if (!isTopLevelDeclaration(node)) {
      continue;
    }

    declarations.push(...extractTopLevelDeclaration(node));
  }

  return { declarations, tree };
}

/**
 * Parses script source into structured declaration data.
 */
export function parseDeclarations(
  content: string,
  dependencies: ParseDependencies
): ParsedDeclaration[] {
  return parseDeclarationsWithTree(content, dependencies).declarations;
}
