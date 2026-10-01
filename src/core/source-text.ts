/**
 * Normalization of raw file text before outlining: rejects non-UTF-8 text, strips the BOM
 * and converts CRLF line endings to LF so no language engine has to handle them.
 */

const UTF8_BOM = '﻿';
const NUL_CHARACTER = '\0';

/**
 * Raised when file content is not UTF-8 text (for example UTF-16 or binary data).
 */
export class NotUtf8TextError extends Error {
  constructor() {
    super('Content is not UTF-8 text');
    this.name = 'NotUtf8TextError';
  }
}

/**
 * Normalizes UTF-8-decoded file text for outlining.
 * NUL characters never appear in UTF-8 source text but are present in UTF-16 and binary files,
 * so they are treated as a reliable "not UTF-8 text" signal.
 * @param content File content decoded as UTF-8.
 * @returns Content without BOM and with LF line endings.
 * @throws NotUtf8TextError when the content contains NUL characters.
 */
export function normalizeSourceText(content: string): string {
  if (content.includes(NUL_CHARACTER)) {
    throw new NotUtf8TextError();
  }
  const withoutBom = content.startsWith(UTF8_BOM) ? content.slice(UTF8_BOM.length) : content;
  return withoutBom.replace(/\r\n/g, '\n');
}
