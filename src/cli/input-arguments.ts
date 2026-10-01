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
 * Classifies input arguments into directories, glob patterns or file paths.
 */
export interface ClassifiedInputArguments {
  directories: string[];
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
export function isGlobPattern(arg: string): boolean {
  return new Minimatch(arg, { magicalBraces: true }).hasMagic();
}

/**
 * Kind of a positional input argument.
 */
type InputArgumentKind = 'directory' | 'glob' | 'file';

/**
 * Classifies one argument. Existing paths are always literal, even when they contain
 * glob characters such as `[id]`; only non-existent arguments with glob magic are globs.
 * A non-existent argument ending in `/` is still a directory (reported as missing later).
 */
async function classifyInputArgument(arg: string, probes: PathProbes): Promise<InputArgumentKind> {
  if (await probes.isDirectory(arg)) {
    return 'directory';
  }
  if (await probes.fileExists(arg)) {
    return 'file';
  }
  if (isGlobPattern(arg)) {
    return 'glob';
  }
  return arg.endsWith('/') ? 'directory' : 'file';
}

/**
 * Splits positional args into directories, glob patterns and literal file paths.
 */
export async function classifyInputArguments(
  inputArgs: string[],
  probes: PathProbes
): Promise<ClassifiedInputArguments> {
  const kinds = await Promise.all(inputArgs.map(async (arg) => classifyInputArgument(arg, probes)));
  const argsOfKind = (kind: InputArgumentKind): string[] =>
    inputArgs.filter((_, index) => kinds[index] === kind);
  return {
    directories: argsOfKind('directory'),
    globPatterns: argsOfKind('glob'),
    filePaths: argsOfKind('file')
  };
}
