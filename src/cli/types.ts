/**
 * Shared CLI runtime types for dependency injection and content processing.
 */

import type { OutlineGenerationResult } from '../core/language-registry.js';

/**
 * Injectable dependencies used by CLI run paths for I/O and process signaling.
 */
export interface RunDependencies {
  fileExists: (filePath: string) => Promise<boolean>;
  isDirectory: (filePath: string) => Promise<boolean>;
  readTextFile: (filePath: string) => Promise<string>;
  writeOutput: (value: string) => void;
  writeError: (value: string) => void;
  setExitCode: (code: number) => void;
  globber?: (pattern: string) => Promise<string[]>;
  /**
   * Lists all regular files recursively in a directory.
   * Skips symlinked directories to avoid cycles and duplicates.
   * Returns normalized file paths (forward slashes) sorted lexicographically.
   */
  listFiles?: (dirPath: string) => Promise<string[]>;
}

/**
 * Processes file content and returns outline generation result.
 */
export type ContentProcessor = (filePath: string, content: string) => OutlineGenerationResult;
