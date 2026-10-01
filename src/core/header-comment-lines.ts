/**
 * Shared helpers for rendering extracted header comments into outline lines with comment markers stripped.
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
 * Removes comment delimiters from one line of a block comment (`/**`, `/*`, leading `*`, `*\/`).
 */
function stripBlockCommentMarkers(trimmedLine: string, isFirstLine: boolean): string {
  const withoutClosing = trimmedLine.replace(/\*+\/$/, '');
  const withoutOpening = isFirstLine
    ? withoutClosing.replace(/^\/\*+!?/, '')
    : withoutClosing.replace(/^\*(?!\/)/, '');
  return withoutOpening.trim();
}

/**
 * Removes the line-comment marker (`//`, `///`, `//!`) from one line.
 */
function stripLineCommentMarker(trimmedLine: string): string {
  return trimmedLine.replace(/^\/\/[/!]?/, '').trim();
}

/**
 * Strips comment markers from raw header-comment lines, keeping one entry per input line.
 * Marker-only lines (such as `/**` or ` *\/`) become empty strings.
 * @param rawLines Raw comment lines, starting with the line that opens the comment.
 * @returns Comment text per line, without delimiters and surrounding whitespace.
 */
export function cleanHeaderCommentLines(rawLines: readonly string[]): string[] {
  const isBlockComment = rawLines[0]?.trimStart().startsWith('/*') === true;
  return rawLines.map((rawLine, index) => {
    const trimmedLine = rawLine.trim();
    return isBlockComment
      ? stripBlockCommentMarkers(trimmedLine, index === 0)
      : stripLineCommentMarker(trimmedLine);
  });
}

/**
 * Converts extracted header-comment payload into structured outline lines.
 * Line text has comment markers stripped; marker-only lines keep an empty text so debug mode
 * can still highlight them, and blank source lines are skipped.
 */
export function buildHeaderCommentOutlineLines(
  headerComment: HeaderCommentPayload | null
): OutlineLine[] {
  if (headerComment === null) {
    return [];
  }

  const cleanedLines = cleanHeaderCommentLines(headerComment.rawLines);
  return headerComment.rawLines.flatMap((rawLine, index) =>
    rawLine.trim().length === 0
      ? []
      : [
          {
            kind: 'header-comment' as const,
            text: cleanedLines[index] ?? '',
            lineNumber: headerComment.startLine + index
          }
        ]
  );
}
