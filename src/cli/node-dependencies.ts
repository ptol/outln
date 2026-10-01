/**
 * Default runtime dependencies backed by Node's process and filesystem APIs.
 */

import { createRequire } from 'node:module';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { glob } from 'glob';

import type { DirectoryEntry, DirectoryEntryKind } from './file-walker.js';
import type { RunDependencies } from './types.js';

/**
 * Checks if a path exists and is a directory (following symlinks).
 */
async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Checks if a path exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists directory entries without following symlinks.
 */
async function readDirectory(dirPath: string): Promise<DirectoryEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => {
    const kind: DirectoryEntryKind = entry.isSymbolicLink()
      ? 'symlink'
      : entry.isDirectory()
        ? 'directory'
        : entry.isFile()
          ? 'file'
          : 'other';
    return { name: entry.name, kind };
  });
}

/**
 * Expands a glob pattern to regular files, excluding symlinks.
 * Keeps absolute output for absolute patterns and cwd-relative output otherwise.
 */
async function expandGlob(pattern: string): Promise<string[]> {
  const matches = await glob(pattern, { nodir: true, follow: false, withFileTypes: true });
  return matches
    .filter((match) => !match.isSymbolicLink())
    .map((match) => (isAbsolute(pattern) ? match.fullpathPosix() : match.relativePosix()));
}

/**
 * Reads the package version from the package.json at the package root.
 */
function readVersion(): string {
  const packageJson: unknown = createRequire(import.meta.url)('../../package.json');
  const version: unknown =
    typeof packageJson === 'object' && packageJson !== null && 'version' in packageJson
      ? packageJson.version
      : undefined;
  return typeof version === 'string' ? version : 'unknown';
}

/**
 * Creates the default runtime dependencies for the current process.
 */
export function createNodeRunDependencies(): RunDependencies {
  return {
    currentDirectory: process.cwd().replace(/\\/g, '/'),
    fileExists,
    isDirectory,
    readDirectory,
    readTextFile: async (filePath) => readFile(filePath, 'utf8'),
    globber: expandGlob,
    writeOutput: (value): void => {
      process.stdout.write(value);
    },
    writeError: (value): void => {
      console.error(value);
    },
    setExitCode: (code): void => {
      process.exitCode = code;
    },
    readVersion
  };
}
