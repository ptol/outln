/**
 * Debug mode output generator for source highlighting.
 * Provides ANSI-highlighted source output for debug view.
 */

import type { OutlineLine, OutlineResult } from '../core/types.js';

/**
 * ANSI escape codes for debug highlighting.
 * Use actual escape bytes so terminals render colors correctly.
 */
const ANSI_GREEN = '\x1b[32m';
const ANSI_RESET = '\x1b[0m';

/**
 * Span with line information for rendering.
 */
interface HighlightSpan {
  /** Line number (1-based) */
  line: number;
  /** Start column (1-based inclusive) */
  startColumn: number;
  /** End column (1-based exclusive) */
  endColumn: number;
}

/**
 * Checks if two spans overlap or touch.
 */
function spansOverlapOrTouch(a: HighlightSpan, b: HighlightSpan): boolean {
  if (a.line !== b.line) {
    return false;
  }
  return a.startColumn <= b.endColumn && b.startColumn <= a.endColumn;
}

/**
 * Merges two spans into one.
 */
function mergeSpans(a: HighlightSpan, b: HighlightSpan): HighlightSpan {
  return {
    line: a.line,
    startColumn: Math.min(a.startColumn, b.startColumn),
    endColumn: Math.max(a.endColumn, b.endColumn)
  };
}

/**
 * Merges overlapping or touching spans on the same line.
 * Assumes spans are sorted.
 */
function mergeSpansList(spans: HighlightSpan[]): HighlightSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const firstSpan = spans[0];
  if (firstSpan === undefined) {
    return [];
  }
  const result: HighlightSpan[] = [firstSpan];
  for (let i = 1; i < spans.length; i++) {
    const current = spans[i];
    const last = result[result.length - 1];
    if (current === undefined || last === undefined) {
      continue;
    }
    if (spansOverlapOrTouch(last, current)) {
      result[result.length - 1] = mergeSpans(last, current);
    } else {
      result.push(current);
    }
  }
  return result;
}

/**
 * Builds highlight spans from outline lines.
 * - Header comments: span covers full line (calculated from source line length)
 * - Declarations: span covers the signature portion
 */
function buildHighlightSpans(
  lines: readonly OutlineLine[],
  sourceLines: readonly string[]
): HighlightSpan[] {
  const spans: HighlightSpan[] = [];

  for (const line of lines) {
    if (line.kind === 'header-comment' && line.lineNumber !== undefined) {
      // Header comments: highlight the full line using actual line length
      const sourceLine = sourceLines[line.lineNumber - 1] ?? '';
      spans.push({
        line: line.lineNumber,
        startColumn: 1,
        endColumn: sourceLine.length + 1 // +1 because endColumn is exclusive (1-based)
      });
    } else if (line.kind === 'metadata' && line.lineNumber !== undefined) {
      // Metadata: highlight the full source line
      const sourceLine = sourceLines[line.lineNumber - 1] ?? '';
      spans.push({
        line: line.lineNumber,
        startColumn: 1,
        endColumn: sourceLine.length + 1
      });
    } else if (
      line.kind === 'declaration' &&
      line.span !== undefined &&
      line.lineNumber !== undefined
    ) {
      // Declarations: highlight the signature portion
      spans.push({
        line: line.lineNumber,
        startColumn: line.span.startColumn,
        endColumn: line.span.endColumn
      });
    }
  }

  // Sort by line, then by startColumn
  spans.sort((a, b) => {
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.startColumn - b.startColumn;
  });

  // Merge overlapping or touching spans
  return mergeSpansList(spans);
}

/**
 * Renders debug output with ANSI-highlighted spans.
 * @param sourceLines - Array of source file lines
 * @param spans - Highlight spans (already merged and sorted)
 * @returns Debug output string with ANSI escapes
 */
export function renderDebugOutput(
  sourceLines: readonly string[],
  spans: readonly HighlightSpan[]
): string {
  // Group spans by line for efficient processing
  const spansByLine = new Map<number, HighlightSpan[]>();
  for (const span of spans) {
    const lineSpans = spansByLine.get(span.line) ?? [];
    lineSpans.push(span);
    spansByLine.set(span.line, lineSpans);
  }

  const result: string[] = [];

  for (let i = 0; i < sourceLines.length; i++) {
    const lineNumber = i + 1;
    const line = sourceLines[i] ?? '';
    const lineSpans = spansByLine.get(lineNumber);

    if (lineSpans === undefined || lineSpans.length === 0) {
      // No highlighting for this line
      result.push(line);
      continue;
    }

    // Apply highlighting spans (already sorted and merged)
    let highlightedLine = '';
    let lastEnd = 0;

    for (const span of lineSpans) {
      const start = span.startColumn - 1; // Convert to 0-based
      const end = Math.min(span.endColumn - 1, line.length); // Clamp to line length

      if (start > lastEnd) {
        // Add unhighlighted portion before this span
        highlightedLine += line.slice(lastEnd, start);
      }

      // Add highlighted portion
      highlightedLine += ANSI_GREEN + line.slice(start, end) + ANSI_RESET;
      lastEnd = end;
    }

    // Add remaining unhighlighted portion
    if (lastEnd < line.length) {
      highlightedLine += line.slice(lastEnd);
    }

    result.push(highlightedLine);
  }

  return result.join('\n');
}

/**
 * Generates debug output for a source file.
 * Highlights header comments and declaration signatures with ANSI escapes.
 * @param content - Source file content
 * @param outlineResult - The outline result with span metadata
 * @returns Debug output string with ANSI highlighting
 */
export function generateDebugOutput(content: string, outlineResult: OutlineResult): string {
  const sourceLines = content.split('\n');
  const spans = buildHighlightSpans(outlineResult.lines, sourceLines);
  return renderDebugOutput(sourceLines, spans);
}

/**
 * Validates that an argument is a valid single file or directory path for debug mode.
 * Rejects: multiple paths, glob patterns, missing input.
 * Accepts: single file path or single directory path.
 * @param args - Command line arguments (after filtering flags)
 * @returns Validation result with the validated argument or error message
 */
export function validateDebugInput(
  args: readonly string[]
): { valid: true; arg: string } | { valid: false; error: string } {
  if (args.length !== 1) {
    return { valid: false, error: '--debug requires exactly one input file path.' };
  }

  const [arg] = args;
  if (arg === undefined) {
    return { valid: false, error: '--debug requires exactly one input file path.' };
  }

  // Check for glob patterns
  if (/[*?[]/.test(arg)) {
    return { valid: false, error: '--debug requires exactly one input file path.' };
  }

  return { valid: true, arg };
}
