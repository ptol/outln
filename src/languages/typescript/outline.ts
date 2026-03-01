/**
 * Types and functions for generating plain-text outlines from script source code.
 * Supports TypeScript and JavaScript when paired with the correct parser dependencies.
 */

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

import { extractTopComment, extractTopCommentLineNumber } from './comments.js';
import { parseDeclarationsWithTree } from './declaration-parsing.js';
import { buildHeaderCommentLines } from './outline-lines.js';
import type { ParseDependencies } from './parse-types.js';
import { buildDeclarationOutlineLines } from '../../core/declaration-lines.js';
import { createOutlineResult } from '../../core/outline-renderer.js';
import { attachClassMembers } from './class-members.js';
import { createConfiguredParser } from '../shared/parser-factory.js';
import type {
  OutlineLine,
  OutlineOptions,
  OutlineResult,
  ParsedDeclaration
} from '../../core/types.js';

export type { OutlineOptions, OutlineResult, ParsedDeclaration } from '../../core/types.js';
export type { ParseDependencies } from './parse-types.js';
export { extractTopComment } from './comments.js';

/**
 * Default parser creation using tree-sitter TypeScript.
 */
const defaultParseDependencies: ParseDependencies = {
  createParser: () => createConfiguredParser(TypeScript.typescript)
};

// Re-export Parser type for consumers
export { Parser };

/**
 * Parses script source into structured declaration data.
 */
export function parseDeclarations(
  content: string,
  dependencies: ParseDependencies = defaultParseDependencies
): ParsedDeclaration[] {
  return parseDeclarationsWithTree(content, dependencies).declarations;
}

/**
 * Generates a plain-text outline of top-level script definitions.
 */
export function generateOutline(
  options: OutlineOptions,
  dependencies: ParseDependencies = defaultParseDependencies
): OutlineResult {
  const { filePath, content } = options;
  const topComment = extractTopComment(content);
  const topCommentLineNumber = extractTopCommentLineNumber(content);

  const { declarations, tree } = parseDeclarationsWithTree(content, dependencies);
  const declarationsWithMembers = attachClassMembers(declarations, tree);

  const lines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];
  lines.push(...buildHeaderCommentLines(topComment, topCommentLineNumber));
  lines.push(...buildDeclarationOutlineLines(declarationsWithMembers));

  return createOutlineResult(lines, topComment);
}

export { formatDeclaration } from '../../core/formatter.js';
