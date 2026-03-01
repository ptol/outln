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
 * Finds the index of the first non-blank, non-shebang line.
 * @param lines - Array of source lines
 * @returns Index of the first content line, or lines.length if none found
 */
function findFirstContentLineIndex(lines: readonly string[]): number {
  let index = 0;

  // Skip shebang line if present
  if (lines[index]?.startsWith('#!') === true) {
    index++;
  }

  // Skip blank lines
  while (index < lines.length && lines[index]?.trim() === '') {
    index++;
  }

  return index;
}

/**
 * Calculates the character position in text where a given line starts.
 * @param lines - Array of source lines
 * @param lineIndex - Index of the target line
 * @returns Character position (0-based) where the line starts
 */
function getLineStartPosition(lines: readonly string[], lineIndex: number): number {
  let position = 0;
  for (let i = 0; i < lineIndex; i++) {
    const line = lines[i];
    if (line !== undefined) {
      position += line.length + 1; // +1 for the newline that was removed by split
    }
  }
  return position;
}

/**
 * Extracts consecutive single-line comments starting from a given line index.
 * @param lines - Array of source lines
 * @param startIndex - Index to start extracting from
 * @returns Joined comment lines
 */
function extractSingleLineComments(lines: readonly string[], startIndex: number): string {
  const commentLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    if (line.trimStart().startsWith('//')) {
      commentLines.push(line);
      index++;
    } else {
      break;
    }
  }

  return commentLines.join('\n');
}

/**
 * Extracts the first top-of-file comment from source text.
 * Skips BOM, shebang, and blank lines before looking for a comment.
 * @param content - Source code text
 * @returns The extracted comment text, or null if none found
 */
export function extractTopComment(content: string): string | null {
  const text = stripBom(content);
  const lines = text.split(/\r?\n/);

  const index = findFirstContentLineIndex(lines);

  if (index >= lines.length) {
    return null;
  }

  const firstLine = lines[index];
  if (firstLine === undefined) {
    return null;
  }

  const currentPos = getLineStartPosition(lines, index);

  // Check for block comment
  const blockCommentStartInLine = firstLine.indexOf('/*');
  if (blockCommentStartInLine !== -1) {
    const commentStartPos = currentPos + blockCommentStartInLine;
    const blockCommentEnd = text.indexOf('*/', commentStartPos);
    if (blockCommentEnd !== -1) {
      // Slice from start of line to preserve indentation, not from the /* position
      return text.slice(currentPos, blockCommentEnd + 2);
    }
  }

  // Check for single-line comments
  const firstLineTrimmed = firstLine.trimStart();
  if (firstLineTrimmed.startsWith('//')) {
    return extractSingleLineComments(lines, index);
  }

  return null;
}

/**
 * Extracts the starting line number of the top-of-file comment (1-based).
 * Returns null if no header comment is found.
 * @param content - The file content to analyze
 * @returns The 1-based line number where the header comment starts, or null
 */
export function extractTopCommentLineNumber(content: string): number | null {
  const text = stripBom(content);
  const lines = text.split(/\r?\n/);

  const index = findFirstContentLineIndex(lines);

  if (index >= lines.length) {
    return null;
  }

  const firstLine = lines[index];
  if (firstLine === undefined) {
    return null;
  }

  const firstLineTrimmed = firstLine.trimStart();
  // Check for block comment or single-line comment
  if (firstLineTrimmed.startsWith('/*') || firstLineTrimmed.startsWith('//')) {
    return index + 1; // Convert to 1-based line number
  }

  return null;
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
