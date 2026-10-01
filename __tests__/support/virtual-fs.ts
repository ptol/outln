/**
 * In-memory filesystem used by CLI tests: builds walker, reader and glob dependencies from a file map.
 */

import { minimatch } from 'minimatch';

import type { DirectoryEntry } from '../../src/cli/file-walker.js';
import type { RunDependencies } from '../../src/cli/types.js';

/**
 * Virtual current directory; inputs are relative paths under it.
 */
export const VIRTUAL_CURRENT_DIRECTORY = '/virtual';

/**
 * Filesystem-facing subset of run dependencies provided by the virtual filesystem.
 */
export type VirtualFileSystem = Pick<
  RunDependencies,
  'currentDirectory' | 'fileExists' | 'isDirectory' | 'readDirectory' | 'readTextFile' | 'globber'
>;

/**
 * Strips trailing slashes so `dir/` and `dir` are the same path.
 */
function stripTrailingSlash(filePath: string): string {
  return filePath.replace(/\/+$/, '');
}

/**
 * Lists the immediate children of a virtual directory with their kinds.
 */
function listChildren(
  filePaths: readonly string[],
  emptyDirectories: readonly string[],
  dirPath: string
): DirectoryEntry[] {
  const prefix = dirPath === '.' ? '' : `${stripTrailingSlash(dirPath)}/`;
  const kindByName = new Map<string, DirectoryEntry['kind']>();
  for (const path of [...filePaths, ...emptyDirectories.map((dir) => `${dir}/`)]) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    const remainder = path.slice(prefix.length);
    const [name, ...rest] = remainder.split('/');
    if (name === undefined || name.length === 0) {
      continue;
    }
    kindByName.set(name, rest.length > 0 ? 'directory' : 'file');
  }
  return [...kindByName.entries()].map(([name, kind]) => ({ name, kind }));
}

/**
 * Creates virtual filesystem dependencies from a path-to-content map.
 * @param files Virtual file contents keyed by relative path.
 * @param emptyDirectories Directories that exist without containing files.
 */
export function createVirtualFileSystem(
  files: ReadonlyMap<string, string>,
  emptyDirectories: readonly string[] = []
): VirtualFileSystem {
  const filePaths = [...files.keys()];
  const isDirectory = (filePath: string): boolean => {
    const normalized = stripTrailingSlash(filePath);
    if (normalized === '.' || emptyDirectories.includes(normalized)) {
      return true;
    }
    return filePaths.some((path) => path.startsWith(`${normalized}/`));
  };

  return {
    currentDirectory: VIRTUAL_CURRENT_DIRECTORY,
    fileExists: (filePath) => Promise.resolve(files.has(filePath)),
    isDirectory: (filePath) => Promise.resolve(isDirectory(filePath)),
    readDirectory: (dirPath) =>
      isDirectory(dirPath)
        ? Promise.resolve(listChildren(filePaths, emptyDirectories, dirPath))
        : Promise.reject(new Error(`Missing virtual directory: ${dirPath}`)),
    readTextFile: (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) {
        return Promise.reject(new Error(`Missing virtual file: ${filePath}`));
      }
      return Promise.resolve(content);
    },
    globber: (pattern) => Promise.resolve(filePaths.filter((path) => minimatch(path, pattern)))
  };
}
