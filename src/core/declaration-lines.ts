/**
 * Shared helpers for converting parsed declarations into outline lines.
 */

import { formatSingleDeclaration } from './formatter.js';
import type { OutlineLine, OutlineLineSpan, ParsedDeclaration } from './types.js';

/**
 * Optional behavior for declaration-to-outline-line conversion.
 */
export interface DeclarationLineOptions {
  /**
   * Returns a span override for each declaration.
   * When omitted, span is inferred from declaration start/end columns.
   */
  spanForDeclaration?: (declaration: ParsedDeclaration) => OutlineLineSpan | undefined;
  /** Prefix used for nested member lines. Defaults to two spaces. */
  memberIndent?: string;
}

/**
 * Builds outline lines for top-level declarations and any nested members.
 */
export function buildDeclarationOutlineLines(
  declarations: readonly ParsedDeclaration[],
  options: DeclarationLineOptions = {}
): OutlineLine[] {
  const lines: OutlineLine[] = [];
  const memberIndent = options.memberIndent ?? '  ';

  const resolveSpan =
    options.spanForDeclaration ??
    ((declaration: ParsedDeclaration): OutlineLineSpan | undefined => {
      if (declaration.startColumn === undefined || declaration.endColumn === undefined) {
        return undefined;
      }
      return {
        startColumn: declaration.startColumn,
        endColumn: declaration.endColumn
      };
    });

  for (const declaration of declarations) {
    const declarationSpan = resolveSpan(declaration);
    const declarationLineNumber = declaration.declaratorLine ?? declaration.startLine;
    lines.push({
      kind: 'declaration',
      text: formatSingleDeclaration(declaration),
      ...(declarationSpan !== undefined && { span: declarationSpan }),
      lineNumber: declarationLineNumber
    });

    if (declaration.members === undefined || declaration.members.length === 0) {
      continue;
    }

    for (const member of declaration.members) {
      const memberSpan = resolveSpan(member);
      const memberLineNumber = member.declaratorLine ?? member.startLine;
      lines.push({
        kind: 'declaration',
        text: `${memberIndent}${formatSingleDeclaration(member)}`,
        ...(memberSpan !== undefined && { span: memberSpan }),
        lineNumber: memberLineNumber
      });
    }
  }

  return lines;
}
