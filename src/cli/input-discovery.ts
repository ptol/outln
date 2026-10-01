/**
 * Expands directory and glob arguments into the supported, non-ignored files to summarize.
 */

import { resolveLanguageEngine } from '../core/language-registry.js';
import {
  filterIgnoredMatches,
  getGlobBaseDirectory,
  sortPaths,
  walkDirectory
} from './file-walker.js';
import { isGlobPattern } from './input-arguments.js';
import type { RunDependencies } from './types.js';

/**
 * Discovered files plus errors for inputs that could not be expanded.
 */
export interface DiscoveredInputs {
  filePaths: string[];
  errors: string[];
}

/**
 * Normalizes path separators to forward slashes.
 */
function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Checks whether any language engine supports the file, based on its path only.
 */
export function isSupportedFilePath(filePath: string): boolean {
  return resolveLanguageEngine(filePath) !== null;
}

/**
 * De-duplicates paths after separator normalization and returns them sorted.
 */
export function deduplicateAndSortPaths(paths: readonly string[]): string[] {
  return sortPaths([...new Set(paths.map(normalizePathSeparators))]);
}

/**
 * Expands one directory argument, reporting a missing directory as an error.
 */
async function expandDirectory(
  directory: string,
  dependencies: RunDependencies
): Promise<DiscoveredInputs> {
  if (!(await dependencies.isDirectory(directory))) {
    return { filePaths: [], errors: [`Directory ${directory} does not exist`] };
  }
  return { filePaths: await walkDirectory(directory, dependencies), errors: [] };
}

/**
 * Expands one glob pattern and drops ignored matches.
 */
async function expandGlob(pattern: string, dependencies: RunDependencies): Promise<string[]> {
  const matches = (await dependencies.globber(pattern)).map(normalizePathSeparators);
  const baseDirectory = getGlobBaseDirectory(pattern, isGlobPattern);
  return filterIgnoredMatches(matches, baseDirectory, dependencies);
}

/**
 * Expands directories and glob patterns into sorted, unique, supported file paths.
 * Unsupported file types are skipped silently, before any file is read.
 * @param directories Directory arguments.
 * @param globPatterns Glob pattern arguments.
 * @param dependencies Injected filesystem access.
 * @returns Discovered file paths and expansion errors.
 */
export async function discoverInputFiles(
  directories: readonly string[],
  globPatterns: readonly string[],
  dependencies: RunDependencies
): Promise<DiscoveredInputs> {
  const directoryResults = await Promise.all(
    directories.map(async (directory) => expandDirectory(directory, dependencies))
  );
  const globResults = await Promise.all(
    globPatterns.map(async (pattern) => expandGlob(pattern, dependencies))
  );
  const allPaths = [
    ...directoryResults.flatMap((result) => result.filePaths),
    ...globResults.flat()
  ];
  return {
    filePaths: deduplicateAndSortPaths(allPaths).filter(isSupportedFilePath),
    errors: directoryResults.flatMap((result) => result.errors)
  };
}
