/**
 * End-to-end workflow tests for iteration 026 Rust top-header comment behavior.
 */

import { describe, expect, it } from 'vitest';

import { runWithVirtualFiles } from './support/virtual-run.js';

describe('iteration 026 rust header workflow (e2e)', () => {
  describe('happy path', () => {
    it('emits top regular comment block before Rust declarations in file mode', async () => {
      const result = await runWithVirtualFiles(['input/with-header.rs'], {
        'input/with-header.rs': [
          '#!/usr/bin/env rust-script',
          '',
          '// Service bootstrap for CLI scripts.',
          '// Loads config and starts runner.',
          '',
          'fn main() {}'
        ].join('\n')
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe(
        [
          'input/with-header.rs',
          '// Service bootstrap for CLI scripts.',
          '// Loads config and starts runner.',
          '[L6-L6] fn main ()'
        ].join('\n') + '\n'
      );
    });
  });

  describe('edge cases', () => {
    it('does not scan past a leading Rust doc comment to later regular comments', async () => {
      const result = await runWithVirtualFiles(['input/doc-first.rs'], {
        'input/doc-first.rs': [
          '//! Module docs stay excluded.',
          '// Regular comment should not become file header.',
          'fn main() {}'
        ].join('\n')
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe(['input/doc-first.rs', '[L3-L3] fn main ()'].join('\n') + '\n');
    });
  });

  describe('error cases', () => {
    it('reports missing Rust files as a file-mode error', async () => {
      const result = await runWithVirtualFiles(['input/missing.rs'], {});

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('File input/missing.rs does not exist');
    });
  });
});
