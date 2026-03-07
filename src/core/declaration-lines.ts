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

  function addDeclarationWithMembers(decl: ParsedDeclaration, indent: string): void {
    const declarationSpan = resolveSpan(decl);
    const declarationLineNumber = decl.declaratorLine ?? decl.startLine;
    lines.push({
      kind: 'declaration',
      text: `${indent}${formatSingleDeclaration(decl)}`,
      ...(declarationSpan !== undefined && { span: declarationSpan }),
      lineNumber: declarationLineNumber
    });

    if (decl.members === undefined || decl.members.length === 0) {
      return;
    }

    for (const member of decl.members) {
      addDeclarationWithMembers(member, indent + memberIndent);
    }
  }

  for (const declaration of declarations) {
    addDeclarationWithMembers(declaration, '');
  }

  return lines;
}
