/**
 * Shared helpers for rendering extracted header comments into outline lines.
 */

import type { OutlineLine } from './types.js';

/**
 * Header comment payload used by language extractors.
 */
export interface HeaderCommentPayload {
  /** Raw comment lines to render in the outline (for example: lines starting with //). */
  rawLines: readonly string[];
  /** 1-based source line number of the first raw header-comment line. */
  startLine: number;
}

/**
 * Converts extracted header-comment payload into structured outline lines.
 */
export function buildHeaderCommentOutlineLines(
  headerComment: HeaderCommentPayload | null
): OutlineLine[] {
  if (headerComment === null) {
    return [];
  }

  const lines: OutlineLine[] = [];
  for (let i = 0; i < headerComment.rawLines.length; i++) {
    const rawLine = headerComment.rawLines[i];
    if (rawLine === undefined) {
      continue;
    }
    lines.push({
      kind: 'header-comment',
      text: rawLine,
      lineNumber: headerComment.startLine + i
    });
  }

  return lines;
}
