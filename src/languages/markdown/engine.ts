/**
 * Markdown language engine for outline generation.
 * Extracts YAML frontmatter and heading structure from Markdown files.
 */

import type { OutlineLanguageEngine } from '../../core/language-engine.js';
import type { OutlineLine, OutlineOptions, OutlineResult } from '../../core/types.js';
import { createOutlineResult } from '../../core/outline-renderer.js';

const MARKDOWN_EXTENSION = '.md';

function matchesMarkdownFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(MARKDOWN_EXTENSION);
}

/**
 * Parses a YAML scalar value and returns its JSON representation.
 * Handles strings (quoted or unquoted), numbers, booleans, and null.
 */
function parseYamlScalar(value: string): string {
  const trimmed = value.trim();

  // Empty value
  if (trimmed === '') {
    return 'null';
  }

  // Handle quoted strings
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    // Return as JSON string (double quoted)
    return JSON.stringify(trimmed.slice(1, -1));
  }

  // Handle unquoted strings - check if it's a special value
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false' || lower === 'null' || lower === '~' || lower === '') {
    return lower === '~' ? 'null' : lower;
  }

  // Check if it's a number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  // It's an unquoted string, return as JSON string (with quotes)
  return JSON.stringify(trimmed);
}

/**
 * Parses simple YAML frontmatter content (only top-level scalar key/value pairs).
 * Returns an array of {key, value} objects in declaration order.
 */
function parseFrontmatter(content: string): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') {
      continue;
    }

    // Parse key: value
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue; // Skip lines without colon
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1);

    // Only include top-level keys (no indentation)
    if (key && !line.startsWith(' ') && !line.startsWith('\t')) {
      result.push({ key, value: parseYamlScalar(value) });
    }
  }

  return result;
}

/**
 * Processed heading with metadata for outline generation.
 */
interface ProcessedHeading {
  /** Formatted heading line for outline output */
  text: string;
  /** 1-based line number in the source file */
  lineNumber: number;
  /** Span for debug mode highlighting (startColumn, endColumn) */
  span: { startColumn: number; endColumn: number };
}

/**
 * Processes a line to extract heading if it matches the pattern.
 * Returns the processed heading or null.
 */
function processHeadingLine(line: string, lineNumber: number): ProcessedHeading | null {
  // Check for heading pattern: ^#{1,6} (1-6 hash marks followed by space)
  const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
  if (headingMatch === null) {
    return null;
  }

  const hashes = headingMatch[1];
  const rawHeadingText = headingMatch[2];

  if (hashes === undefined || rawHeadingText === undefined) {
    return null;
  }

  const headingText = rawHeadingText.trim();
  return {
    text: `[L${lineNumber.toString()}-L${lineNumber.toString()}] ${hashes} ${headingText}`,
    lineNumber,
    span: {
      startColumn: 1,
      endColumn: hashes.length + 1 + headingText.length + 1
    }
  };
}

/**
 * Extracts headings from Markdown body content (excluding frontmatter).
 * Respects code fences - headings inside code blocks are ignored.
 * @param bodyLines - Array of content lines (frontmatter already removed)
 * @param startLineNumber - 1-based line number where body starts
 * @returns Array of processed headings with metadata
 */
function extractHeadingsFromBody(
  bodyLines: readonly string[],
  startLineNumber: number
): ProcessedHeading[] {
  const headings: ProcessedHeading[] = [];
  let inCodeFence = false;

  for (let i = 0; i < bodyLines.length; i++) {
    const rawLine = bodyLines[i];
    if (rawLine === undefined) {
      continue;
    }

    // Strip trailing carriage return for CRLF compatibility
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    // Check for code fence toggle
    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }

    // Skip content inside code fences
    if (inCodeFence) {
      continue;
    }

    // Check for heading pattern
    const lineNumber = startLineNumber + i;
    const heading = processHeadingLine(line, lineNumber);
    if (heading !== null) {
      headings.push(heading);
    }
  }

  return headings;
}

/**
 * Generates an outline from Markdown content.
 * Extracts YAML frontmatter and heading structure.
 */
function generateMarkdownOutline(options: OutlineOptions): OutlineResult {
  const { filePath, content } = options;

  // Extract frontmatter block first (separates concerns from heading extraction)
  const { lines: frontmatterLines, bodyStartLine, hasFrontmatter } = parseFrontmatterBlock(content);

  // Split content to get body lines (after frontmatter)
  const allLines = content.split('\n');
  const bodyStartIndex = bodyStartLine - 1; // Convert to 0-based index
  const bodyLines = allLines.slice(bodyStartIndex);

  // Extract headings from body content only
  const headingLines = extractHeadingsFromBody(bodyLines, bodyStartLine);

  // Build output lines: file path first, then frontmatter (if valid), then headings
  const outlineLines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];
  const metadata: Record<string, unknown> = {};

  if (hasFrontmatter && frontmatterLines.length > 0) {
    for (let lineIdx = 0; lineIdx < frontmatterLines.length; lineIdx++) {
      const sourceLine = frontmatterLines[lineIdx];
      if (sourceLine === undefined) continue;

      const colonIndex = sourceLine.indexOf(':');
      if (colonIndex === -1) continue;

      const key = sourceLine.slice(0, colonIndex).trim();
      const value = sourceLine.slice(colonIndex + 1);

      if (!key || sourceLine.startsWith(' ') || sourceLine.startsWith('\t')) continue;

      const lineNumber = lineIdx + 2;
      const parsedValue = parseYamlScalar(value);
      outlineLines.push({
        kind: 'metadata',
        text: `${key}: ${parsedValue}`,
        lineNumber,
        span: {
          startColumn: 1,
          endColumn: sourceLine.length + 1
        }
      });
      metadata[key] = parsedValue;
    }
  }

  for (const heading of headingLines) {
    outlineLines.push({
      kind: 'declaration',
      text: heading.text,
      lineNumber: heading.lineNumber,
      span: heading.span
    });
  }

  return createOutlineResult(outlineLines, metadata);
}

/**
 * Result of parsing a Markdown frontmatter block.
 */
interface FrontmatterBlockResult {
  /** The raw frontmatter content lines (empty if no frontmatter) */
  readonly lines: readonly string[];
  /** 1-based line number where the document body starts (after frontmatter) */
  readonly bodyStartLine: number;
  /** Whether a properly terminated frontmatter block was found */
  readonly hasFrontmatter: boolean;
}

/**
 * Extracts frontmatter block from Markdown content.
 * Frontmatter must start on line 1 with '---' and end with a matching '---'.
 * Returns the frontmatter lines and where the body content begins.
 * @param content - The full Markdown content
 * @returns Object containing frontmatter lines, body start line, and whether frontmatter was found
 */
function parseFrontmatterBlock(content: string): FrontmatterBlockResult {
  const lines = content.split('\n');

  // Frontmatter must start on line 1
  if (lines[0] !== '---') {
    return { lines: [], bodyStartLine: 1, hasFrontmatter: false };
  }

  const frontmatterLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;

    // Check for frontmatter end marker
    if (line === '---') {
      return {
        lines: frontmatterLines,
        bodyStartLine: i + 2, // Line after the closing ---
        hasFrontmatter: true
      };
    }
    frontmatterLines.push(line);
  }

  // Unterminated frontmatter - treat as body content
  return { lines: [], bodyStartLine: 1, hasFrontmatter: false };
}

/**
 * Extracts summary from Markdown content.
 * Returns formatted key-value pairs from frontmatter, or null if no valid frontmatter.
 */
function extractMarkdownSummary(content: string): { summary: string | null } {
  const { lines, hasFrontmatter } = parseFrontmatterBlock(content);

  if (!hasFrontmatter || lines.length === 0) {
    return { summary: null };
  }

  const frontmatterText = lines.join('\n');
  const parsedFrontmatter = parseFrontmatter(frontmatterText);

  if (parsedFrontmatter.length === 0) {
    return { summary: null };
  }

  // Format as "key: value, key2: value2"
  const formattedPairs = parsedFrontmatter.map(({ key, value }) => `${key}: ${value}`);
  return { summary: formattedPairs.join(', ') };
}

export const markdownLanguageEngine: OutlineLanguageEngine = {
  id: 'markdown',
  matchesFilePath: matchesMarkdownFilePath,
  generateOutline: generateMarkdownOutline,
  extractSummary: extractMarkdownSummary
};
