/**
 * Shared helpers for rendering structured outline lines.
 */

import type { OutlineLine, OutlineMetadata, OutlineResult } from './types.js';

/**
 * Checks whether a line is a header-comment line with no text (a delimiter-only line such as `/**`).
 * Such lines exist for debug highlighting but are not printed.
 */
function isEmptyHeaderCommentLine(line: OutlineLine): boolean {
  return line.kind === 'header-comment' && line.text.length === 0;
}

/**
 * Renders outline lines into the canonical output format.
 * Always includes a trailing newline to preserve current CLI behavior.
 */
export function renderOutlineLines(lines: readonly OutlineLine[]): string {
  const printedLines = lines.filter((line) => !isEmptyHeaderCommentLine(line));
  return `${printedLines.map((line) => line.text).join('\n')}\n`;
}

/**
 * Creates an outline result from structured lines and language metadata.
 */
export function createOutlineResult(
  lines: readonly OutlineLine[],
  metadata: OutlineMetadata
): OutlineResult {
  return {
    outline: renderOutlineLines(lines),
    lines: [...lines],
    metadata
  };
}
