/**
 * End-to-end tests for outlining source files larger than tree-sitter's default 32 KB input buffer.
 */

import { describe, expect, it } from 'vitest';

import { runWithVirtualFiles } from './support/virtual-run.js';

const DECLARATION_COUNT = 4000;

/**
 * Builds a source file by repeating one declaration template per index.
 */
function buildLargeSource(declarationForIndex: (index: number) => string, prefix = ''): string {
  const declarations = Array.from({ length: DECLARATION_COUNT }, (_, index) =>
    declarationForIndex(index)
  );
  return prefix + declarations.join('\n') + '\n';
}

const largeSourcesByPath: Record<string, string> = {
  'input/big.ts': buildLargeSource(
    (index) => `export const value${index.toString()} = ${index.toString()};`
  ),
  'input/big.go': buildLargeSource((index) => `func F${index.toString()}() {}`, 'package big\n'),
  'input/big.rs': buildLargeSource((index) => `fn f${index.toString()}() {}`),
  'input/Big.java': buildLargeSource((index) => `class C${index.toString()} {}`),
  'input/big.kt': buildLargeSource((index) => `fun f${index.toString()}() {}`),
  'input/Big.cs': buildLargeSource((index) => `class C${index.toString()} {}`)
};

describe('large file outlines (e2e)', () => {
  describe('happy path', () => {
    for (const [filePath, content] of Object.entries(largeSourcesByPath)) {
      it(`outlines ${filePath} (${content.length.toString()} chars)`, async () => {
        expect(content.length).toBeGreaterThan(32 * 1024);

        const result = await runWithVirtualFiles([filePath], { [filePath]: content });

        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);
        const lastLine = `[L${(DECLARATION_COUNT + (filePath.endsWith('.go') ? 1 : 0)).toString()}`;
        expect(result.stdout).toContain(lastLine);
      });
    }
  });
});
