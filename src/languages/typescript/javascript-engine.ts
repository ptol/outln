/**
 * JavaScript language engine configuration for outline generation.
 */

import JavaScript from 'tree-sitter-javascript';

import type { ParseDependencies } from './outline.js';
import { createFilePathMatcher, createScriptLanguageEngine } from './script-engine.js';
import { createConfiguredParser } from '../shared/parser-factory.js';

const JAVASCRIPT_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'] as const;

const matchesJavaScriptFilePath = createFilePathMatcher({
  extensions: JAVASCRIPT_EXTENSIONS
});

const javaScriptParseDependencies: ParseDependencies = {
  createParser: () => createConfiguredParser(JavaScript)
};

function resolveJavaScriptParseDependencies(): ParseDependencies {
  return javaScriptParseDependencies;
}

export const javaScriptLanguageEngine = createScriptLanguageEngine({
  id: 'javascript',
  matchesFilePath: matchesJavaScriptFilePath,
  resolveParseDependencies: resolveJavaScriptParseDependencies
});
