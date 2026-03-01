/**
 * Unit tests for Rust header comment extraction behavior.
 */

import { describe, expect, it } from 'vitest';

import { extractRustHeaderComment } from '../src/languages/rust/header-comment.js';

describe('extractRustHeaderComment', () => {
  it('extracts contiguous regular comments after leading shebang and blank lines', () => {
    const content = [
      '#!/usr/bin/env rust-script',
      '',
      '// Header line one.',
      '// Header line two.',
      '',
      'fn main() {}'
    ].join('\n');

    expect(extractRustHeaderComment(content)).toEqual({
      rawLines: ['// Header line one.', '// Header line two.'],
      joinedText: 'Header line one. Header line two.',
      startLine: 3
    });
  });

  it('does not scan past leading doc comments to capture later regular comments', () => {
    const content = [
      '//! Module docs',
      '/// Item docs',
      '// Captured regular comment',
      'fn main() {}'
    ].join('\n');

    expect(extractRustHeaderComment(content)).toBeNull();
  });

  it('does not scan past a leading block comment to capture later regular comments', () => {
    const content = ['/* Block comment */', '// Captured regular comment', 'struct Item {}'].join(
      '\n'
    );

    expect(extractRustHeaderComment(content)).toBeNull();
  });

  it('stops header capture at the first blank line', () => {
    const content = [
      '// Header line one.',
      '',
      '// Not contiguous and must be excluded.',
      'fn main() {}'
    ].join('\n');

    expect(extractRustHeaderComment(content)).toEqual({
      rawLines: ['// Header line one.'],
      joinedText: 'Header line one.',
      startLine: 1
    });
  });

  it('returns null when no regular comment header exists', () => {
    const content = ['//! Only docs', '/* and blocks */', 'fn main() {}'].join('\n');
    expect(extractRustHeaderComment(content)).toBeNull();
  });
});
