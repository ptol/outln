/**
 * Shared tree-sitter parser factory helpers for language engines.
 */

import Parser from 'tree-sitter';

type ParserLanguage = Parameters<Parser['setLanguage']>[0];

/**
 * Creates a parser pre-configured with the provided tree-sitter language.
 */
export function createConfiguredParser(language: ParserLanguage): Parser {
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
