/**
 * End-to-end tests for exit codes of glob view mode with walked, explicit and missing inputs.
 */

import { describe, expect, it } from 'vitest';

import { runWithVirtualFiles } from './support/virtual-run.js';

const files = {
  'input/src/a.ts': '/** A. */\nexport const a = 1;\n',
  'input/src/data.json': '{}',
  'input/notes.txt': 'plain text'
};

describe('glob view exit codes (e2e)', () => {
  describe('happy path', () => {
    it('exits 0 when walked unsupported files are skipped', async () => {
      const result = await runWithVirtualFiles(['input/src'], files);

      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('error cases', () => {
    it('exits 1 for an explicitly named unsupported file next to a directory', async () => {
      const result = await runWithVirtualFiles(['input/src', 'input/notes.txt'], files);

      expect(result.stdout).toContain('input/src/a.ts: A.');
      expect(result.stderr).toBe('FILE input/notes.txt HAS UNSUPPORTED FILE TYPE');
      expect(result.exitCode).toBe(1);
    });

    it('exits 1 for an explicitly named unsupported file in file mode', async () => {
      const result = await runWithVirtualFiles(['input/notes.txt'], files);

      expect(result.stderr).toBe('FILE input/notes.txt HAS UNSUPPORTED FILE TYPE');
      expect(result.exitCode).toBe(1);
    });

    it('exits 1 for a missing directory while still listing other inputs', async () => {
      const result = await runWithVirtualFiles(['input/missing/', 'input/src'], files);

      expect(result.stdout).toContain('input/src/a.ts: A.');
      expect(result.stderr).toBe('Directory input/missing/ does not exist');
      expect(result.exitCode).toBe(1);
    });
  });
});
