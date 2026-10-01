/**
 * Static CLI help text printed by `outln --help`.
 */

/**
 * Short usage line, also printed when no input paths are given.
 */
export const USAGE_LINE = 'Usage: outln [options] <path|glob>...';

/**
 * Full help text describing modes, options and examples.
 */
export const HELP_TEXT = `${USAGE_LINE}

Print a compact structural outline of source files.

Modes:
  outln <file>...            Full outline for each file (headers, declarations, line ranges).
  outln <dir|glob>...        One line per file with its header comment.
  outln --debug <file|dir>   Source text with the extracted outline highlighted.

Options:
  -h, --help                 Show this help.
  -v, --version              Show the installed version.
  --debug                    Enable debug mode.
  --                         Treat all following arguments as paths.

Examples:
  outln src/main.ts
  outln src "docs/**/*.md"
  outln --debug src/main.ts
`;
