/**
 * Registry and resolver for language-specific outline engines.
 */

import type { OutlineLanguageEngine } from './language-engine.js';
import type { OutlineOptions, OutlineResult } from './types.js';
import { markdownLanguageEngine } from '../languages/markdown/engine.js';
import { typeScriptLanguageEngine } from '../languages/typescript/typescript-engine.js';
import { javaScriptLanguageEngine } from '../languages/typescript/javascript-engine.js';
import { goLanguageEngine } from '../languages/go/engine.js';
import { rustLanguageEngine } from '../languages/rust/engine.js';

const REGISTERED_ENGINES: readonly OutlineLanguageEngine[] = [
  markdownLanguageEngine,
  typeScriptLanguageEngine,
  javaScriptLanguageEngine,
  goLanguageEngine,
  rustLanguageEngine
];

/**
 * Returns all built-in language engines in resolver order.
 */
export function getRegisteredLanguageEngines(): readonly OutlineLanguageEngine[] {
  return REGISTERED_ENGINES;
}

/**
 * Resolves the most appropriate language engine for a file path.
 * Returns null if no engine supports the file extension.
 */
export function resolveLanguageEngine(filePath: string): OutlineLanguageEngine | null {
  return REGISTERED_ENGINES.find((engine) => engine.matchesFilePath(filePath)) ?? null;
}

/**
 * Result of attempting to generate an outline for a file.
 */
export interface OutlineGenerationResult {
  /** Whether an appropriate language engine was found */
  readonly supported: boolean;
  /** The outline result (only present when supported is true) */
  readonly result?: OutlineResult;
  /** Error message for unsupported files (only present when supported is false) */
  readonly errorMessage?: string;
}

/**
 * Generates an outline by first resolving the correct language engine.
 * Returns a result indicating whether the file type is supported.
 */
export function generateOutlineForFile(options: OutlineOptions): OutlineGenerationResult {
  const engine = resolveLanguageEngine(options.filePath);
  if (engine === null) {
    return {
      supported: false,
      errorMessage: `FILE ${options.filePath} HAS UNSUPPORTED FILE TYPE`
    };
  }
  return {
    supported: true,
    result: engine.generateOutline(options)
  };
}

/**
 * Result of attempting to extract a summary from a file.
 */
export interface SummaryExtractionResult {
  /** Whether an appropriate language engine was found */
  readonly supported: boolean;
  /** The extracted summary (only present when supported is true) */
  readonly summary?: string | null;
  /** Error message for unsupported files (only present when supported is false) */
  readonly errorMessage?: string;
}

/**
 * Extracts a summary from file content by first resolving the correct language engine.
 * Returns a result indicating whether the file type is supported and the summary.
 */
export function extractSummaryFromFile(filePath: string, content: string): SummaryExtractionResult {
  const engine = resolveLanguageEngine(filePath);
  if (engine === null) {
    return {
      supported: false,
      errorMessage: `FILE ${filePath} HAS UNSUPPORTED FILE TYPE`
    };
  }
  const result = engine.extractSummary(content);
  return {
    supported: true,
    summary: result.summary
  };
}
