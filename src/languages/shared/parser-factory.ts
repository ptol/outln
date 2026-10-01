/**
 * Shared tree-sitter parser helpers for language engines: parser creation and size-safe parsing.
 */

import Parser from 'tree-sitter';

type ParserLanguage = Parameters<Parser['setLanguage']>[0];

/**
 * Default node-tree-sitter input buffer size (in UTF-16 code units).
 * Inputs larger than this fail with "Invalid argument" unless a bigger buffer is requested.
 */
const DEFAULT_PARSE_BUFFER_SIZE = 32 * 1024;

/**
 * Creates a parser pre-configured with the provided tree-sitter language.
 */
export function createConfiguredParser(language: ParserLanguage): Parser {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

/**
 * Parses source text with a buffer large enough for the whole input.
 * @param parser Configured tree-sitter parser.
 * @param content Source text to parse.
 * @returns Parsed syntax tree.
 */
export function parseSource(parser: Parser, content: string): Parser.Tree {
  const bufferSize = Math.max(DEFAULT_PARSE_BUFFER_SIZE, content.length + 1);
  return parser.parse(content, undefined, { bufferSize });
}
