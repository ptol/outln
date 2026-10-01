/**
 * CLI entrypoint that prints concatenated content from one or more input file paths.
 */
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOutlineForFile } from './core/language-registry.js';
import { runDebugMode, runFileMode, runGlobViewMode, failWithError } from './cli/modes.js';
import type { ContentProcessor, RunDependencies } from './cli/types.js';
import { createStdoutErrorHandler } from './cli/broken-pipe.js';
import { createNodeRunDependencies } from './cli/node-dependencies.js';
import { HELP_TEXT, USAGE_LINE } from './cli/help-text.js';
import { parseArguments, classifyInputArguments } from './cli/input-arguments.js';
export type { ContentProcessor, RunDependencies } from './cli/types.js';
export type { ParsedArguments } from './cli/input-arguments.js';
export { parseArguments } from './cli/input-arguments.js';

/**
 * Default runtime dependencies that use Node process and filesystem APIs.
 */
const defaultRunDependencies: RunDependencies = createNodeRunDependencies();

/**
 * Default processor that generates outline from source content.
 */
const defaultContentProcessor: ContentProcessor = (filePath, content) => {
  return generateOutlineForFile({ filePath, content });
};

/**
 * Reads and prints concatenated file content from provided CLI path arguments.
 * @param args Process argument vector, usually `process.argv`.
 * @param dependencies Optional dependency overrides for testing and non-process runtimes.
 * @param processor Optional content processor for transforming file content.
 * @returns Resolves when output is written or sets a non-zero exit code on failure.
 */
export async function run(
  args: string[],
  dependencies: RunDependencies = defaultRunDependencies,
  processor: ContentProcessor = defaultContentProcessor
): Promise<void> {
  const { debug, help, version, unknownOptions, positional } = parseArguments(args);

  if (help) {
    dependencies.writeOutput(HELP_TEXT);
    return;
  }

  if (version) {
    dependencies.writeOutput(`${dependencies.readVersion()}\n`);
    return;
  }

  const [firstUnknownOption] = unknownOptions;
  if (firstUnknownOption !== undefined) {
    failWithError(
      dependencies,
      `Unknown option ${firstUnknownOption}. Run outln --help for usage.`
    );
    return;
  }

  if (positional.length === 0 && !debug) {
    failWithError(dependencies, `${USAGE_LINE}\nRun outln --help for details.`);
    return;
  }

  if (debug) {
    await runDebugMode(positional, dependencies);
    return;
  }

  const { directories, globPatterns, filePaths } = await classifyInputArguments(
    positional,
    dependencies
  );
  const hasExpandableInputs = directories.length > 0 || globPatterns.length > 0;

  if (hasExpandableInputs && filePaths.length > 0) {
    failWithError(dependencies, 'Cannot mix glob patterns and file paths in one command.');
    return;
  }

  if (hasExpandableInputs) {
    await runGlobViewMode(positional, directories, globPatterns, dependencies);
  } else {
    await runFileMode(filePaths, dependencies, processor);
  }
}

/**
 * Checks whether the current module is the direct Node entrypoint.
 * @param args Process argument vector.
 * @param moduleUrl Current module URL from `import.meta.url`.
 * @returns True when this module is being executed directly.
 */
export function isDirectExecution(args: string[], moduleUrl: string): boolean {
  const scriptPath = args[1];
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) {
    return false;
  }

  const modulePath = fileURLToPath(moduleUrl);
  return normalizeExecutionPath(scriptPath) === normalizeExecutionPath(modulePath);
}

/**
 * Normalizes execution paths for robust direct-entrypoint detection.
 * Resolves absolute paths and follows symlinks when possible.
 */
function normalizeExecutionPath(filePath: string): string {
  const absolutePath = resolve(filePath);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

if (isDirectExecution(process.argv, import.meta.url)) {
  process.stdout.on(
    'error',
    createStdoutErrorHandler((code) => process.exit(code))
  );
  void run(process.argv);
}
