/**
 * Shared script-language engine helpers for TypeScript and JavaScript.
 */

import type { OutlineLanguageEngine } from '../../core/language-engine.js';
import { generateOutline, type ParseDependencies } from './outline.js';
import { extractTopComment, cleanCommentText } from './comments.js';
import type { OutlineOptions, OutlineResult } from '../../core/types.js';

/**
 * Config for creating a script language engine.
 */
export interface ScriptLanguageEngineOptions {
  /** Stable language identifier (for example: "typescript", "javascript") */
  id: string;
  /** Returns true when this script engine should process the given file path */
  matchesFilePath: (filePath: string) => boolean;
  /** Resolves parser dependencies based on file path (for example .ts vs .tsx) */
  resolveParseDependencies: (filePath: string) => ParseDependencies;
}

/**
 * Options for case-insensitive file path matching by extension and suffix.
 */
export interface FilePathMatcherOptions {
  /** Standard file extensions like ".ts" and ".jsx" */
  extensions: readonly string[];
  /** Optional special suffixes like ".d.ts" */
  suffixes?: readonly string[];
}

/**
 * Builds a case-insensitive matcher for file paths.
 */
export function createFilePathMatcher(
  options: FilePathMatcherOptions
): (filePath: string) => boolean {
  const normalizedExtensions = options.extensions.map((extension) => extension.toLowerCase());
  const normalizedSuffixes = (options.suffixes ?? []).map((suffix) => suffix.toLowerCase());

  return (filePath: string): boolean => {
    const normalizedFilePath = filePath.toLowerCase();

    if (normalizedSuffixes.some((suffix) => normalizedFilePath.endsWith(suffix))) {
      return true;
    }

    return normalizedExtensions.some((extension) => normalizedFilePath.endsWith(extension));
  };
}

/**
 * Extracts summary from script content.
 * Returns the cleaned top comment text, or null if no comment is found.
 */
function extractScriptSummary(content: string): { summary: string | null } {
  const rawComment = extractTopComment(content);
  if (rawComment === null) {
    return { summary: null };
  }
  return { summary: cleanCommentText(rawComment) };
}

/**
 * Creates a script-language engine that shares outline and summary behavior.
 */
export function createScriptLanguageEngine(
  options: ScriptLanguageEngineOptions
): OutlineLanguageEngine {
  return {
    id: options.id,
    matchesFilePath: options.matchesFilePath,
    generateOutline: (
      outlineOptions: OutlineOptions,
      dependencies?: ParseDependencies
    ): OutlineResult => {
      // Use provided dependencies for testing, otherwise resolve from file path
      const parseDependencies =
        dependencies ?? options.resolveParseDependencies(outlineOptions.filePath);
      return generateOutline(outlineOptions, parseDependencies);
    },
    extractSummary: extractScriptSummary
  };
}
