/**
 * CLI entrypoint that prints concatenated content from one or more input file paths.
 */
import { realpathSync } from 'node:fs';
import { access, readFile, stat, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateOutlineForFile } from './core/language-registry.js';
import { runDebugMode, runFileMode, runGlobViewMode, failWithError } from './cli/modes.js';
import type { ContentProcessor, RunDependencies } from './cli/types.js';
import {
  parseArguments,
  normalizeInputArguments,
  classifyInputArguments
} from './cli/input-arguments.js';
export type { ContentProcessor, RunDependencies } from './cli/types.js';
export type { ParsedArguments } from './cli/input-arguments.js';
export { parseArguments } from './cli/input-arguments.js';

/**
 * Checks if a path is a directory.
 * @param filePath The path to check.
 * @returns True if the path exists and is a directory.
 */
async function defaultIsDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Recursively lists all regular files in a directory.
 * Skips symlinked directories to avoid cycles and duplicates.
 * @param dirPath The directory path to traverse.
 * @returns Array of normalized file paths (forward slashes) sorted lexicographically.
 */
async function defaultListFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function traverse(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = `${currentPath}/${entry.name}`;

      if (entry.isDirectory()) {
        // Skip symlinked directories to avoid cycles and duplicates
        if (entry.isSymbolicLink()) {
          continue;
        }
        await traverse(fullPath);
      } else if (entry.isFile()) {
        // Normalize path separators to forward slashes
        files.push(fullPath.replace(/\\/g, '/'));
      }
    }
  }

  await traverse(dirPath);

  // Sort lexicographically for consistent output
  return files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'variant' }));
}

/**
 * Default runtime dependencies that use Node process and filesystem APIs.
 */
const defaultRunDependencies: RunDependencies = {
  fileExists: async (filePath) => {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  isDirectory: defaultIsDirectory,
  readTextFile: async (filePath) => readFile(filePath, 'utf8'),
  writeOutput: (value) => {
    process.stdout.write(value);
  },
  writeError: (value) => {
    console.error(value);
  },
  setExitCode: (code) => {
    process.exitCode = code;
  },
  listFiles: defaultListFiles
};

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
  const { debug, positional } = parseArguments(args);

  if (positional.length === 0 && !debug) {
    failWithError(dependencies, 'Usage: outln <file-path> [file-path...]');
    return;
  }

  if (debug) {
    await runDebugMode(positional, dependencies);
    return;
  }

  const normalizedArgs = await normalizeInputArguments(positional, dependencies.isDirectory);
  const { globPatterns, filePaths } = classifyInputArguments(normalizedArgs);

  if (globPatterns.length > 0 && filePaths.length > 0) {
    failWithError(dependencies, 'Cannot mix glob patterns and file paths in one command.');
    return;
  }

  if (globPatterns.length > 0) {
    await runGlobViewMode(globPatterns, dependencies);
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
  void run(process.argv);
}
