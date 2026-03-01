/**
 * CLI argument parsing and input path normalization helpers.
 */

import { Minimatch } from 'minimatch';

/**
 * Result of parsing CLI arguments for debug mode.
 */
export interface ParsedArguments {
  /** Whether debug mode is enabled */
  debug: boolean;
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

/**
 * Extracts CLI flags and positional arguments from process-like argv values.
 * @param args Process argument vector, usually `process.argv`.
 * @returns Parsed arguments with debug flag and positional paths.
 */
export function parseArguments(args: string[]): ParsedArguments {
  const rawArgs = args.slice(2);
  const debug = rawArgs.includes('--debug');
  const positional = rawArgs.filter((arg) => arg !== '--debug' && arg.length > 0);
  return { debug, positional };
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
