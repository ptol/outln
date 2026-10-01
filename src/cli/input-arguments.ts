/**
 * CLI argument parsing and input path normalization helpers.
 */

import { Minimatch } from 'minimatch';

/**
 * Result of parsing CLI flags and positional arguments.
 */
export interface ParsedArguments {
  /** Whether debug mode is enabled (`--debug`) */
  debug: boolean;
  /** Whether help output was requested (`--help`, `-h`) */
  help: boolean;
  /** Whether version output was requested (`--version`, `-v`) */
  version: boolean;
  /** Option-like arguments that are not recognized */
  unknownOptions: string[];
  /** Remaining positional arguments after flag extraction */
  positional: string[];
}

/**
 * Classifies normalized input arguments into glob patterns or file paths.
 */
export interface ClassifiedInputArguments {
  globPatterns: string[];
  filePaths: string[];
}

const HELP_FLAGS = new Set(['--help', '-h']);
const VERSION_FLAGS = new Set(['--version', '-v']);
const DEBUG_FLAG = '--debug';
const END_OF_OPTIONS = '--';

/**
 * Checks whether an argument looks like a command-line option rather than a path.
 */
function isOptionLike(arg: string): boolean {
  return arg.startsWith('-') && arg !== '-';
}

/**
 * Extracts CLI flags and positional arguments from process-like argv values.
 * Arguments after `--` are always treated as positional paths.
 * @param args Process argument vector, usually `process.argv`.
 * @returns Parsed flags, unknown options and positional paths.
 */
export function parseArguments(args: string[]): ParsedArguments {
  const rawArgs = args.slice(2).filter((arg) => arg.length > 0);
  const endOfOptionsIndex = rawArgs.indexOf(END_OF_OPTIONS);
  const optionArgs = endOfOptionsIndex === -1 ? rawArgs : rawArgs.slice(0, endOfOptionsIndex);
  const forcedPositional = endOfOptionsIndex === -1 ? [] : rawArgs.slice(endOfOptionsIndex + 1);

  const options = optionArgs.filter(isOptionLike);
  const isKnownOption = (arg: string): boolean =>
    arg === DEBUG_FLAG || HELP_FLAGS.has(arg) || VERSION_FLAGS.has(arg);

  return {
    debug: options.includes(DEBUG_FLAG),
    help: options.some((arg) => HELP_FLAGS.has(arg)),
    version: options.some((arg) => VERSION_FLAGS.has(arg)),
    unknownOptions: options.filter((arg) => !isKnownOption(arg)),
    positional: [...optionArgs.filter((arg) => !isOptionLike(arg)), ...forcedPositional]
  };
}

/**
 * Checks if an argument contains glob magic characters.
 * @param arg The argument to check.
 * @returns True if the argument is a glob pattern.
 */
function isGlobPattern(arg: string): boolean {
  return new Minimatch(arg, { magicalBraces: true }).hasMagic();
}

/**
 * Checks if an argument contains wildcard tokens (*, ?, [).
 * @param arg The argument to check.
 * @returns True if the argument contains wildcards.
 */
function hasWildcardToken(arg: string): boolean {
  return /[*?[]/.test(arg);
}

/**
 * Determines if a positional argument is a directory argument.
 * A directory argument has no wildcard tokens and either ends with '/' or resolves to an existing directory.
 * @param arg The positional argument to check.
 * @param isDirectoryFn Function to check if a path is an existing directory.
 * @returns True if the argument should be treated as a directory.
 */
async function isDirectoryArgument(
  arg: string,
  isDirectoryFn: (filePath: string) => Promise<boolean>
): Promise<boolean> {
  if (hasWildcardToken(arg)) {
    return false;
  }

  if (arg.endsWith('/')) {
    return true;
  }

  return await isDirectoryFn(arg);
}

/**
 * Normalizes a directory argument to a recursive glob pattern.
 * Removes trailing slashes and appends the recursive glob suffix.
 * @param dirArg The directory argument to normalize.
 * @returns The normalized glob pattern.
 */
function normalizeDirectoryArgument(dirArg: string): string {
  const withoutTrailingSlash = dirArg.replace(/\/+$/, '');
  return `${withoutTrailingSlash}/**/*`;
}

/**
 * Normalizes raw positional arguments.
 * Directory arguments are converted to recursive glob patterns.
 */
export async function normalizeInputArguments(
  inputArgs: string[],
  isDirectoryFn: (filePath: string) => Promise<boolean>
): Promise<string[]> {
  const normalizedArgs: string[] = [];
  for (const arg of inputArgs) {
    if (await isDirectoryArgument(arg, isDirectoryFn)) {
      normalizedArgs.push(normalizeDirectoryArgument(arg));
    } else {
      normalizedArgs.push(arg);
    }
  }
  return normalizedArgs;
}

/**
 * Splits normalized args into either glob patterns or file paths.
 */
export function classifyInputArguments(inputArgs: string[]): ClassifiedInputArguments {
  const globPatterns: string[] = [];
  const filePaths: string[] = [];

  for (const arg of inputArgs) {
    if (isGlobPattern(arg)) {
      globPatterns.push(arg);
    } else {
      filePaths.push(arg);
    }
  }

  return { globPatterns, filePaths };
}
