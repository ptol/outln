/**
 * Shared CLI runtime types for dependency injection and content processing.
 */

import type { OutlineGenerationResult } from '../core/language-registry.js';
import type { WalkerDependencies } from './file-walker.js';

/**
 * Injectable dependencies used by CLI run paths for I/O and process signaling.
 */
export interface RunDependencies extends WalkerDependencies {
  writeOutput: (value: string) => void;
  writeError: (value: string) => void;
  setExitCode: (code: number) => void;
  /** Returns the installed outln version for `--version`. */
  readVersion: () => string;
  /** Expands a glob pattern to matching regular files (symlinks excluded). */
  globber: (pattern: string) => Promise<string[]>;
}

/**
 * Processes file content and returns outline generation result.
 */
export type ContentProcessor = (filePath: string, content: string) => OutlineGenerationResult;
