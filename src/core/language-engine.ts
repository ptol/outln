/**
 * Shared interface for language-specific outline generators.
 */

import type { OutlineOptions, OutlineResult } from './types.js';
import type { ParseDependencies } from '../languages/typescript/outline.js';

/**
 * Summary extraction result.
 */
export interface SummaryResult {
  /** The extracted summary text, or null if none available */
  summary: string | null;
}

/**
 * A pluggable outline engine for a source language.
 */
export interface OutlineLanguageEngine {
  /** Stable language identifier (for example: "typescript") */
  id: string;
  /** Returns true when this engine should process the given file path */
  matchesFilePath: (filePath: string) => boolean;
  /** Generates an outline for language-specific source content */
  generateOutline: (options: OutlineOptions, dependencies?: ParseDependencies) => OutlineResult;
  /**
   * Extracts a summary from file content.
   * For TypeScript/JavaScript: returns the top comment text.
   * For Markdown: returns frontmatter as formatted key-value pairs.
   */
  extractSummary: (content: string) => SummaryResult;
}
