/**
 * Top-of-file comment extraction from source text.
 */

/**
 * UTF-8 BOM character code.
 */
const BOM_CHAR_CODE = 0xfeff;

/**
 * Strips the UTF-8 BOM from the start of content if present.
 * @param content - The source code content
 * @returns Content without BOM
 */
function stripBom(content: string): string {
  if (content.charCodeAt(0) === BOM_CHAR_CODE) {
    return content.slice(1);
  }
  return content;
}

/**
 * Matches a directive prologue line such as `'use client';` or `"use strict"`.
 */
const DIRECTIVE_LINE_PATTERN = /^\s*(['"])[^'"]*\1\s*;?\s*$/;

/**
 * Top-of-file comment with its raw text and position.
 */
export interface TopComment {
  /** Raw comment text including delimiters, one source line per `\n`-separated line. */
  text: string;
  /** 1-based source line number of the first comment line. */
  startLine: number;
}

/**
 * Finds the index of the first line that is not a shebang, blank line or directive.
 * @param lines - Array of source lines
 * @returns Index of the first content line, or lines.length if none found
 */
function findFirstContentLineIndex(lines: readonly string[]): number {
  const startIndex = lines[0]?.startsWith('#!') === true ? 1 : 0;
  const firstContentOffset = lines
    .slice(startIndex)
    .findIndex((line) => line.trim() !== '' && !DIRECTIVE_LINE_PATTERN.test(line));
  return firstContentOffset === -1 ? lines.length : startIndex + firstContentOffset;
}

/**
 * Collects a block comment starting at `startIndex`, ending at the line containing its `*\/`.
 * Text after the closing delimiter on that line is dropped.
 * @returns The raw block comment lines, or null when the comment is not terminated.
 */
function extractBlockCommentLines(lines: readonly string[], startIndex: number): string[] | null {
  const firstLine = lines[startIndex] ?? '';
  const openingIndex = firstLine.indexOf('/*');
  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const searchFrom = index === startIndex ? openingIndex + 2 : 0;
    const closingIndex = line.indexOf('*/', searchFrom);
    if (closingIndex !== -1) {
      const blockLines = lines.slice(startIndex, index);
      return [...blockLines, line.slice(0, closingIndex + 2)];
    }
  }
  return null;
}

/**
 * Extracts consecutive single-line comments starting from a given line index.
 * @param lines - Array of source lines
 * @param startIndex - Index to start extracting from
 * @returns Raw comment lines
 */
function extractSingleLineComments(lines: readonly string[], startIndex: number): string[] {
  const endOffset = lines.slice(startIndex).findIndex((line) => !line.trimStart().startsWith('//'));
  return lines.slice(startIndex, endOffset === -1 ? lines.length : startIndex + endOffset);
}

/**
 * Extracts the first top-of-file comment from source text.
 * Skips BOM, shebang, blank lines and directive prologues (`'use client'`, `'use strict'`)
 * before looking for a comment that starts a line.
 * @param content - Source code text
 * @returns The comment text and start line, or null if none found
 */
export function extractTopComment(content: string): TopComment | null {
  const lines = stripBom(content).split(/\r?\n/);
  const index = findFirstContentLineIndex(lines);
  const firstLine = lines[index]?.trimStart();
  if (firstLine === undefined) {
    return null;
  }

  const commentLines = firstLine.startsWith('/*')
    ? extractBlockCommentLines(lines, index)
    : firstLine.startsWith('//')
      ? extractSingleLineComments(lines, index)
      : null;

  return commentLines === null ? null : { text: commentLines.join('\n'), startLine: index + 1 };
}

/**
 * Cleans up a JSDoc/block comment by removing delimiters and leading asterisks.
 * @param comment The raw comment text.
 * @returns Cleaned comment text.
 */
export function cleanCommentText(comment: string): string {
  // Handle block comments: /** ... */ or /* ... */
  if (comment.startsWith('/*')) {
    // Remove /* and */ delimiters
    let cleaned = comment.slice(2);
    if (cleaned.endsWith('*/')) {
      cleaned = cleaned.slice(0, -2);
    }

    // Split into lines and process each
    const lines = cleaned.split(/\r?\n/);
    const processedLines: string[] = [];

    for (const line of lines) {
      // Trim the line
      let trimmed = line.trim();

      // Remove leading * from JSDoc-style comments
      if (trimmed.startsWith('*')) {
        trimmed = trimmed.slice(1).trim();
      }

      if (trimmed.length > 0) {
        processedLines.push(trimmed);
      }
    }

    return processedLines.join(' ');
  }

  // Handle single-line comments: // ...
  if (comment.startsWith('//')) {
    const lines = comment.split(/\r?\n/);
    const processedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) {
        processedLines.push(trimmed.slice(2).trim());
      }
    }

    return processedLines.join(' ');
  }

  return comment.trim();
}
