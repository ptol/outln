/**
 * Reads source files through the injected reader and normalizes their text,
 * mapping failures to the CLI's one-line error messages.
 */

import { NotUtf8TextError, normalizeSourceText } from '../core/source-text.js';
import type { RunDependencies } from './types.js';

/**
 * Result of reading a source file: normalized content or a formatted error message.
 */
export type SourceReadResult = { ok: true; content: string } | { ok: false; error: string };

/**
 * Builds the stderr message for a file that could not be read or parsed.
 */
export function formatReadFailure(filePath: string, error?: unknown): string {
  if (error instanceof NotUtf8TextError) {
    return `FILE ${filePath} IS NOT UTF-8 TEXT`;
  }
  return `FILE ${filePath} COULD NOT BE READ OR PARSED`;
}

/**
 * Reads a file and normalizes its text (BOM removed, CRLF converted to LF).
 * @param filePath Path to read.
 * @param dependencies Injected file reader.
 * @returns Normalized content, or an error message when reading or decoding fails.
 */
export async function readSourceFile(
  filePath: string,
  dependencies: Pick<RunDependencies, 'readTextFile'>
): Promise<SourceReadResult> {
  try {
    const rawContent = await dependencies.readTextFile(filePath);
    return { ok: true, content: normalizeSourceText(rawContent) };
  } catch (error) {
    return { ok: false, error: formatReadFailure(filePath, error) };
  }
}
