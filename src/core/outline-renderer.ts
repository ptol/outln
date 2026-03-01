/**
 * Shared helpers for rendering structured outline lines.
 */

import type { OutlineLine, OutlineMetadata, OutlineResult } from './types.js';

/**
 * Renders outline lines into the canonical output format.
 * Always includes a trailing newline to preserve current CLI behavior.
 */
export function renderOutlineLines(lines: readonly OutlineLine[]): string {
  return `${lines.map((line) => line.text).join('\n')}\n`;
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
