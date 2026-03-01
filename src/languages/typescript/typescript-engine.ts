/**
 * TypeScript language engine configuration for outline generation.
 */

import TypeScript from 'tree-sitter-typescript';

import type { ParseDependencies } from './outline.js';
import { createFilePathMatcher, createScriptLanguageEngine } from './script-engine.js';
import { createConfiguredParser } from '../shared/parser-factory.js';

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;
const TYPESCRIPT_SUFFIXES = ['.d.ts'] as const;
const TSX_EXTENSION = '.tsx';

const matchesTypeScriptFilePath = createFilePathMatcher({
  extensions: TYPESCRIPT_EXTENSIONS,
  suffixes: TYPESCRIPT_SUFFIXES
});

const typeScriptParseDependencies: ParseDependencies = {
  createParser: () => createConfiguredParser(TypeScript.typescript)
};

const typeScriptJsxParseDependencies: ParseDependencies = {
  createParser: () => createConfiguredParser(TypeScript.tsx)
};

function resolveTypeScriptParseDependencies(filePath: string): ParseDependencies {
  const normalizedFilePath = filePath.toLowerCase();
  if (normalizedFilePath.endsWith(TSX_EXTENSION)) {
    return typeScriptJsxParseDependencies;
  }
  return typeScriptParseDependencies;
}

export const typeScriptLanguageEngine = createScriptLanguageEngine({
  id: 'typescript',
  matchesFilePath: matchesTypeScriptFilePath,
  resolveParseDependencies: resolveTypeScriptParseDependencies
});
