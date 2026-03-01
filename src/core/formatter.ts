/**
 * Declaration formatting utilities for generating outline output.
 */

import type { ParsedDeclaration } from './types.js';

/**
 * Normalizes whitespace in text by collapsing multiple whitespace characters
 * (including newlines) to single spaces and trimming the result.
 * @param text - The text to normalize
 * @returns Normalized text with single spaces
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Formats the body text for a declaration line, excluding line-range prefix.
 * @param declaration - The parsed declaration
 * @returns Declaration body text (for example: "export function run(x: number)")
 */
export function formatDeclarationBody(declaration: ParsedDeclaration): string {
  const modifiers = declaration.modifiers.length > 0 ? `${declaration.modifiers} ` : '';

  // If a language extractor provides a signature, emit it as-is.
  // Otherwise, build a default "kind + name" representation.
  const usesSignature = declaration.signature.length > 0;
  const body = usesSignature
    ? declaration.signature
    : declaration.name.length > 0
      ? `${declaration.kind} ${declaration.name}`
      : declaration.kind;

  return `${modifiers}${body}`;
}

/**
 * Formats the range prefix for a declaration line.
 * @param declaration - The parsed declaration
 * @returns Range prefix (for example: "[L3-L5]")
 */
export function formatDeclarationRange(declaration: ParsedDeclaration): string {
  return `[L${declaration.startLine.toString()}-L${declaration.endLine.toString()}]`;
}

/**
 * Formats a single parsed declaration into an outline line (without members).
 * @param declaration - The parsed declaration
 * @returns Formatted outline line
 */
export function formatSingleDeclaration(declaration: ParsedDeclaration): string {
  const range = formatDeclarationRange(declaration);
  const body = formatDeclarationBody(declaration);
  return `${range} ${body}`;
}

/**
 * Formats a parsed declaration into output lines, including indented member lines.
 * @param declaration - The parsed declaration
 * @returns Array of formatted lines
 */
export function formatDeclarationLines(declaration: ParsedDeclaration): string[] {
  const lines: string[] = [formatSingleDeclaration(declaration)];

  // Append indented member lines if members exist
  if (declaration.members !== undefined && declaration.members.length > 0) {
    for (const member of declaration.members) {
      lines.push(`  ${formatSingleDeclaration(member)}`);
    }
  }

  return lines;
}

/**
 * Formats a parsed declaration into an outline line, optionally including nested members.
 * Members are indented with 2 leading spaces.
 * @param declaration - The parsed declaration
 * @returns Formatted outline lines (declaration + indented members if present)
 */
export function formatDeclaration(declaration: ParsedDeclaration): string {
  return formatDeclarationLines(declaration).join('\n');
}
