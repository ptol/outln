/**
 * Rust top-of-file header comment extraction utilities.
 */

/**
 * Extracted Rust header comment details.
 */
export interface RustHeaderComment {
  /** Raw comment lines with // prefix (for outline rendering) */
  rawLines: string[];
  /** Joined comment text without // prefix (for glob summary rendering) */
  joinedText: string;
  /** 1-based source line number of the first header comment line */
  startLine: number;
}

/**
 * Checks if a line is a doc comment (/// or //!).
 */
function isDocComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('///') || trimmed.startsWith('//!');
}

/**
 * Checks if a line is a regular line comment (//) but not a doc comment.
 */
function isRegularComment(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') && !isDocComment(trimmed);
}

/**
 * Checks if a line is a shebang.
 */
function isShebang(line: string): boolean {
  return line.trim().startsWith('#!');
}

/**
 * Extracts the Rust file header comment.
 * Behavior:
 * - skips leading blank lines and at most one shebang
 * - starts capture only if the next line is a regular // comment
 * - captures only the first contiguous regular // block
 * - stops on the first non-regular-// line after capture starts
 */
export function extractRustHeaderComment(content: string): RustHeaderComment | null {
  const lines = content.split('\n');
  const rawLines: string[] = [];
  let index = 0;
  let skippedLeadingShebang = false;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      index++;
      continue;
    }
    if (!skippedLeadingShebang && isShebang(trimmed)) {
      skippedLeadingShebang = true;
      index++;
      continue;
    }
    break;
  }

  const startCandidate = lines[index];
  if (startCandidate === undefined || !isRegularComment(startCandidate)) {
    return null;
  }

  const startLine = index + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || !isRegularComment(line)) {
      break;
    }
    rawLines.push(line);
    index++;
  }

  if (rawLines.length === 0) {
    return null;
  }

  const commentTexts = rawLines.map((line) => line.slice(2).trim());
  return {
    rawLines,
    joinedText: commentTexts.join(' '),
    startLine
  };
}
