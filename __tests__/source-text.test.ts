/**
 * Unit tests for source text normalization (UTF-8 validation, BOM and CRLF handling).
 */

import { describe, expect, it } from 'vitest';

import { NotUtf8TextError, normalizeSourceText } from '../src/core/source-text.js';

describe('normalizeSourceText', () => {
  it('converts CRLF line endings to LF', () => {
    expect(normalizeSourceText('a\r\nb\r\n')).toBe('a\nb\n');
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(normalizeSourceText('﻿export const a = 1;')).toBe('export const a = 1;');
  });

  it('leaves LF text unchanged', () => {
    expect(normalizeSourceText('a\nb')).toBe('a\nb');
  });

  it('rejects UTF-16 text decoded as UTF-8', () => {
    const utf16Bytes = Buffer.from('﻿const a = 1;', 'utf16le');

    expect(() => normalizeSourceText(utf16Bytes.toString('utf8'))).toThrow(NotUtf8TextError);
  });

  it('rejects binary content with NUL bytes', () => {
    expect(() => normalizeSourceText('PNG\0\0\0data')).toThrow(NotUtf8TextError);
  });
});
