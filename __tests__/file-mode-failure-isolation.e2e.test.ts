/**
 * End-to-end tests ensuring one unreadable file does not hide outlines of other files in file mode.
 */

import { describe, expect, it } from 'vitest';

import { runWithVirtualFiles } from './support/virtual-run.js';

const files = {
  'input/a.ts': 'export const a = 1;\n',
  'input/bad.ts': 'export const bad = 1;\n',
  'input/c.ts': 'export function c(): void {}\n'
};

/**
 * Reader that fails for `input/bad.ts` and serves the other virtual files.
 */
function readFailingForBadFile(filePath: string): Promise<string> {
  if (filePath === 'input/bad.ts') {
    return Promise.reject(new Error('EINVAL: invalid argument'));
  }
  const content = files[filePath as keyof typeof files];
  return Promise.resolve(content);
}

describe('file mode failure isolation (e2e)', () => {
  describe('error cases', () => {
    it('prints outlines for readable files when one file fails to read', async () => {
      const result = await runWithVirtualFiles(
        ['input/a.ts', 'input/bad.ts', 'input/c.ts'],
        files,
        { overrides: { readTextFile: readFailingForBadFile } }
      );

      expect(result.stdout).toBe(
        [
          'input/a.ts',
          '[L1-L1] export const a',
          '',
          'input/c.ts',
          '[L1-L1] export function c(): void',
          ''
        ].join('\n')
      );
      expect(result.stderr).toBe('FILE input/bad.ts COULD NOT BE READ OR PARSED');
      expect(result.exitCode).toBe(1);
    });

    it('reports missing and unreadable files together while still printing the rest', async () => {
      const result = await runWithVirtualFiles(
        ['input/bad.ts', 'input/missing.ts', 'input/a.ts'],
        files,
        { overrides: { readTextFile: readFailingForBadFile } }
      );

      expect(result.stdout).toBe('input/a.ts\n[L1-L1] export const a\n');
      expect(result.stderr).toBe(
        'File input/missing.ts does not exist' + 'FILE input/bad.ts COULD NOT BE READ OR PARSED'
      );
      expect(result.exitCode).toBe(1);
    });
  });
});
