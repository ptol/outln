/**
 * CLI argument parsing and input path normalization helpers.
 */

import { Minimatch, escape } from 'minimatch';

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
 * Filesystem probes used to decide whether an argument names an existing path.
 */
export interface PathProbes {
  isDirectory: (filePath: string) => Promise<boolean>;
  fileExists: (filePath: string) => Promise<boolean>;
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
 * Converts a literal directory path to a recursive glob, escaping glob characters in the path.
 * @param dirArg The directory argument to normalize.
 * @returns The normalized glob pattern.
 */
function toRecursiveDirectoryGlob(dirArg: string): string {
  const withoutTrailingSlash = dirArg.replace(/\/+$/, '');
  return `${escape(withoutTrailingSlash)}/**/*`;
}

/**
 * Classifies one argument. Existing paths are always literal, even when they contain
 * glob characters such as `[id]`; only non-existent arguments with glob magic are globs.
 */
async function classifyInputArgument(
  arg: string,
  probes: PathProbes
): Promise<{ kind: 'glob' | 'file'; value: string }> {
  if (await probes.isDirectory(arg)) {
    return { kind: 'glob', value: toRecursiveDirectoryGlob(arg) };
  }
  if (await probes.fileExists(arg)) {
    return { kind: 'file', value: arg };
  }
  if (isGlobPattern(arg)) {
    return { kind: 'glob', value: arg };
  }
  if (arg.endsWith('/')) {
    return { kind: 'glob', value: toRecursiveDirectoryGlob(arg) };
  }
  return { kind: 'file', value: arg };
}

/**
 * Splits positional args into glob patterns (including directories as recursive globs)
 * and literal file paths.
 */
export async function classifyInputArguments(
  inputArgs: string[],
  probes: PathProbes
): Promise<ClassifiedInputArguments> {
  const classified = await Promise.all(
    inputArgs.map(async (arg) => classifyInputArgument(arg, probes))
  );
  return {
    globPatterns: classified.filter((entry) => entry.kind === 'glob').map((entry) => entry.value),
    filePaths: classified.filter((entry) => entry.kind === 'file').map((entry) => entry.value)
  };
}
