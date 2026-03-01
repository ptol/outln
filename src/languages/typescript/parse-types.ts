/**
 * Parse dependency types shared by TypeScript/JavaScript outline modules.
 */

import type Parser from 'tree-sitter';

/**
 * Dependencies required for parsing script content.
 * Allows injection of language-specific parsers and mock parsers for testing.
 */
export interface ParseDependencies {
  /** Creates and configures a parser */
  createParser: () => Parser;
}
