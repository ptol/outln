/**
 * Unit tests for stripping comment markers from header-comment lines.
 */

import { describe, expect, it } from 'vitest';

import {
  buildHeaderCommentOutlineLines,
  cleanHeaderCommentLines
} from '../src/core/header-comment-lines.js';

describe('cleanHeaderCommentLines', () => {
  it('strips JSDoc delimiters and leading asterisks', () => {
    expect(cleanHeaderCommentLines(['/**', ' * First line.', ' * Second line.', ' */'])).toEqual([
      '',
      'First line.',
      'Second line.',
      ''
    ]);
  });

  it('strips a single-line block comment', () => {
    expect(cleanHeaderCommentLines(['/* Inline block comment */'])).toEqual([
      'Inline block comment'
    ]);
  });

  it('keeps text on the opening and closing lines of a block comment', () => {
    expect(cleanHeaderCommentLines(['  /*! Licensed text', '   continues here */'])).toEqual([
      'Licensed text',
      'continues here'
    ]);
  });

  it('strips //, /// and //! markers', () => {
    expect(cleanHeaderCommentLines(['// plain', '/// doc', '//! inner'])).toEqual([
      'plain',
      'doc',
      'inner'
    ]);
  });

  it('keeps asterisks that are part of line-comment text', () => {
    expect(cleanHeaderCommentLines(['// * bullet'])).toEqual(['* bullet']);
  });
});

describe('buildHeaderCommentOutlineLines', () => {
  it('keeps source line numbers and skips blank source lines', () => {
    const lines = buildHeaderCommentOutlineLines({
      rawLines: ['/**', ' * Text.', '', ' */'],
      startLine: 3
    });

    expect(lines).toEqual([
      { kind: 'header-comment', text: '', lineNumber: 3 },
      { kind: 'header-comment', text: 'Text.', lineNumber: 4 },
      { kind: 'header-comment', text: '', lineNumber: 6 }
    ]);
  });
});
