/**
 * Line-building helpers for TypeScript/JavaScript outline rendering.
 */

import type { OutlineLine } from '../../core/types.js';

/**
 * Builds outline lines from header comment text.
 */
export function buildHeaderCommentLines(
  topComment: string | null,
  topCommentLineNumber: number | null
): OutlineLine[] {
  const lines: OutlineLine[] = [];

  if (topComment === null || topCommentLineNumber === null) {
    return lines;
  }

  const commentLines = topComment.split('\n');
  for (let i = 0; i < commentLines.length; i++) {
    const line = commentLines[i];
    if (line === undefined || line.trim().length === 0) {
      continue;
    }
    lines.push({
      kind: 'header-comment',
      text: line,
      lineNumber: topCommentLineNumber + i
    });
  }

  return lines;
}
