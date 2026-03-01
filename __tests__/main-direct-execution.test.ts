import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isDirectExecution } from '../src/main.js';

describe('isDirectExecution', () => {
  it('returns true when script path is a symlink to the module path', async () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'outln-direct-'));
    const realFilePath = join(testRoot, 'dist', 'main.js');
    const symlinkPath = join(testRoot, 'bin', 'outln');

    try {
      mkdirSync(join(testRoot, 'dist'), { recursive: true });
      mkdirSync(join(testRoot, 'bin'), { recursive: true });
      writeFileSync(realFilePath, 'export {};', { flag: 'w' });
      symlinkSync(realFilePath, symlinkPath);

      const moduleUrl = pathToFileURL(realFilePath).href;
      const result = isDirectExecution(['node', symlinkPath], moduleUrl);

      expect(result).toBe(true);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  });
});
