/**
 * Gitignore-aware file discovery for directory and glob inputs.
 * Walks directories with per-directory .gitignore rules (plus ancestors up to the git root)
 * and always skips node_modules, dot-entries and symlinks.
 */

import { posix } from 'node:path';

import ignore, { type Ignore } from 'ignore';

/**
 * Kind of a directory entry as seen by the walker.
 */
export type DirectoryEntryKind = 'file' | 'directory' | 'symlink' | 'other';

/**
 * One entry returned by `readDirectory`.
 */
export interface DirectoryEntry {
  name: string;
  kind: DirectoryEntryKind;
}

/**
 * Filesystem access needed for discovery, injected for testability.
 */
export interface WalkerDependencies {
  /** Absolute path that relative inputs are resolved against. */
  currentDirectory: string;
  readDirectory: (dirPath: string) => Promise<DirectoryEntry[]>;
  readTextFile: (filePath: string) => Promise<string>;
  fileExists: (filePath: string) => Promise<boolean>;
  isDirectory: (filePath: string) => Promise<boolean>;
}

/**
 * Compiled .gitignore rules anchored at an absolute directory.
 */
interface IgnoreLayer {
  baseDir: string;
  matcher: Ignore;
}

const GITIGNORE_FILE = '.gitignore';
const GIT_MARKER = '.git';
const NODE_MODULES = 'node_modules';

/**
 * Checks whether a path segment is always skipped, regardless of .gitignore.
 */
export function isAlwaysSkippedName(name: string): boolean {
  return name === NODE_MODULES || name.startsWith('.');
}

/**
 * Normalizes separators to forward slashes and strips trailing slashes (keeping a lone `/`).
 */
export function normalizeInputPath(inputPath: string): string {
  const withForwardSlashes = inputPath.replace(/\\/g, '/');
  const withoutTrailing = withForwardSlashes.replace(/\/+$/, '');
  return withoutTrailing.length === 0 ? '/' : withoutTrailing;
}

/**
 * Joins a display directory path and an entry name without introducing `./` prefixes.
 */
function joinDisplayPath(dirPath: string, name: string): string {
  if (dirPath === '.') {
    return name;
  }
  return dirPath.endsWith('/') ? `${dirPath}${name}` : `${dirPath}/${name}`;
}

/**
 * Converts an absolute path to a path usable with the injected filesystem (relative to cwd when possible).
 */
function toFilesystemPath(absolutePath: string, currentDirectory: string): string {
  const relativePath = posix.relative(currentDirectory, absolutePath);
  return relativePath.length === 0 ? '.' : relativePath;
}

/**
 * Lists ancestor directories of an absolute directory, nearest first, excluding the directory itself.
 */
function listAncestorDirectories(absoluteDir: string): string[] {
  const parent = posix.dirname(absoluteDir);
  return parent === absoluteDir ? [] : [parent, ...listAncestorDirectories(parent)];
}

/**
 * Checks whether a directory contains a `.git` entry (directory, or file for worktrees).
 */
async function hasGitMarker(
  absoluteDir: string,
  dependencies: WalkerDependencies
): Promise<boolean> {
  const markerPath = toFilesystemPath(
    posix.join(absoluteDir, GIT_MARKER),
    dependencies.currentDirectory
  );
  return (
    (await dependencies.isDirectory(markerPath)) || (await dependencies.fileExists(markerPath))
  );
}

/**
 * Finds the directories whose .gitignore files apply above `absoluteDir`:
 * from the nearest enclosing git root down to the parent of `absoluteDir`.
 * Returns an empty list when `absoluteDir` is not inside a git repository (or is the root itself).
 */
async function findAncestorIgnoreDirectories(
  absoluteDir: string,
  dependencies: WalkerDependencies
): Promise<string[]> {
  if (await hasGitMarker(absoluteDir, dependencies)) {
    return [];
  }
  const ancestors = listAncestorDirectories(absoluteDir);
  for (const [index, ancestor] of ancestors.entries()) {
    if (await hasGitMarker(ancestor, dependencies)) {
      return ancestors.slice(0, index + 1).reverse();
    }
  }
  return [];
}

/**
 * Loads the .gitignore of an absolute directory as an ignore layer, or null when absent.
 */
async function loadIgnoreLayer(
  absoluteDir: string,
  dependencies: WalkerDependencies
): Promise<IgnoreLayer | null> {
  const gitignorePath = toFilesystemPath(
    posix.join(absoluteDir, GITIGNORE_FILE),
    dependencies.currentDirectory
  );
  if (!(await dependencies.fileExists(gitignorePath))) {
    return null;
  }
  try {
    const rules = await dependencies.readTextFile(gitignorePath);
    return { baseDir: absoluteDir, matcher: ignore().add(rules) };
  } catch {
    return null;
  }
}

/**
 * Loads ignore layers for a list of absolute directories, keeping only directories with a .gitignore.
 */
async function loadIgnoreLayers(
  absoluteDirs: readonly string[],
  dependencies: WalkerDependencies
): Promise<IgnoreLayer[]> {
  const layers = await Promise.all(
    absoluteDirs.map(async (dir) => loadIgnoreLayer(dir, dependencies))
  );
  return layers.filter((layer): layer is IgnoreLayer => layer !== null);
}

/**
 * Applies ignore layers (outermost first) to an absolute path.
 * Deeper .gitignore files override outer ones, including `!` negations.
 */
function isIgnoredByLayers(
  absolutePath: string,
  isDirectory: boolean,
  layers: readonly IgnoreLayer[]
): boolean {
  let ignored = false;
  for (const layer of layers) {
    const relativePath = posix.relative(layer.baseDir, absolutePath);
    if (relativePath.length === 0 || relativePath.startsWith('..')) {
      continue;
    }
    const result = layer.matcher.test(isDirectory ? `${relativePath}/` : relativePath);
    if (result.ignored) {
      ignored = true;
    } else if (result.unignored) {
      ignored = false;
    }
  }
  return ignored;
}

/**
 * Builds the ancestor ignore layers for an explicitly requested root directory.
 * When the root itself is ignored by those layers, they are dropped: an explicitly named
 * directory is always walked, and only its own .gitignore files apply.
 */
async function loadRootAncestorLayers(
  absoluteRoot: string,
  dependencies: WalkerDependencies
): Promise<IgnoreLayer[]> {
  const ancestorDirs = await findAncestorIgnoreDirectories(absoluteRoot, dependencies);
  const ancestorLayers = await loadIgnoreLayers(ancestorDirs, dependencies);
  return isIgnoredByLayers(absoluteRoot, true, ancestorLayers) ? [] : ancestorLayers;
}

/**
 * Recursively collects non-ignored regular files under a directory.
 */
async function walkWithLayers(
  displayDir: string,
  absoluteDir: string,
  inheritedLayers: readonly IgnoreLayer[],
  dependencies: WalkerDependencies
): Promise<string[]> {
  const entries = await dependencies.readDirectory(
    toFilesystemPath(absoluteDir, dependencies.currentDirectory)
  );
  const hasGitignore = entries.some(
    (entry) => entry.name === GITIGNORE_FILE && entry.kind === 'file'
  );
  const ownLayer = hasGitignore ? await loadIgnoreLayer(absoluteDir, dependencies) : null;
  const layers = ownLayer === null ? inheritedLayers : [...inheritedLayers, ownLayer];

  const visibleEntries = entries
    .filter((entry) => entry.kind === 'file' || entry.kind === 'directory')
    .filter((entry) => !isAlwaysSkippedName(entry.name))
    .filter(
      (entry) =>
        !isIgnoredByLayers(posix.join(absoluteDir, entry.name), entry.kind === 'directory', layers)
    );

  const nestedResults = await Promise.all(
    visibleEntries.map(async (entry) => {
      const displayPath = joinDisplayPath(displayDir, entry.name);
      if (entry.kind === 'file') {
        return [displayPath];
      }
      return walkWithLayers(displayPath, posix.join(absoluteDir, entry.name), layers, dependencies);
    })
  );
  return nestedResults.flat();
}

/**
 * Sorts paths lexicographically with a stable, case-sensitive locale comparison.
 */
export function sortPaths(paths: readonly string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'variant' }));
}

/**
 * Lists all non-ignored regular files under a directory, as display paths prefixed by `dirPath`.
 * @param dirPath Directory path as given by the user.
 * @param dependencies Injected filesystem access.
 * @returns Sorted file paths.
 */
export async function walkDirectory(
  dirPath: string,
  dependencies: WalkerDependencies
): Promise<string[]> {
  const displayRoot = normalizeInputPath(dirPath);
  const absoluteRoot = posix.resolve(dependencies.currentDirectory, displayRoot);
  const ancestorLayers = await loadRootAncestorLayers(absoluteRoot, dependencies);
  const files = await walkWithLayers(displayRoot, absoluteRoot, ancestorLayers, dependencies);
  return sortPaths(files);
}

/**
 * Returns the literal (non-glob) leading directory of a glob pattern, e.g. `src` for `src/**\/*.ts`.
 */
export function getGlobBaseDirectory(
  pattern: string,
  isMagicSegment: (segment: string) => boolean
): string {
  const segments = normalizeInputPath(pattern).split('/');
  const firstMagicIndex = segments.findIndex(isMagicSegment);
  const literalSegments = segments.slice(
    0,
    firstMagicIndex === -1 ? segments.length - 1 : firstMagicIndex
  );
  if (literalSegments.length === 0) {
    return '.';
  }
  const joined = literalSegments.join('/');
  return joined.length === 0 ? '/' : joined;
}

/**
 * Checks whether any path segment below the glob base is always skipped (node_modules, dot-entries).
 */
function hasSkippedSegmentBelowBase(absolutePath: string, absoluteBase: string): boolean {
  const relativePath = posix.relative(absoluteBase, absolutePath);
  return relativePath
    .split('/')
    .some((segment) => segment !== '..' && isAlwaysSkippedName(segment));
}

/**
 * Filters glob matches with the same rules as directory walking: always-skipped segments below
 * the glob base, plus .gitignore files from the git root (or the glob base outside a repo)
 * down to each match's directory.
 * @param matches Glob match paths.
 * @param baseDirectory Literal base directory of the glob pattern.
 * @param dependencies Injected filesystem access.
 * @returns Matches that are not ignored, in input order.
 */
export async function filterIgnoredMatches(
  matches: readonly string[],
  baseDirectory: string,
  dependencies: WalkerDependencies
): Promise<string[]> {
  const absoluteBase = posix.resolve(
    dependencies.currentDirectory,
    normalizeInputPath(baseDirectory)
  );
  const ancestorLayers = await loadRootAncestorLayers(absoluteBase, dependencies);
  // Local memo so each directory's .gitignore is read once per filter call.
  const layerByDirectory = new Map<string, Promise<IgnoreLayer | null>>();
  const loadCachedLayer = async (absoluteDir: string): Promise<IgnoreLayer | null> => {
    const cached = layerByDirectory.get(absoluteDir);
    if (cached !== undefined) {
      return cached;
    }
    const pending = loadIgnoreLayer(absoluteDir, dependencies);
    layerByDirectory.set(absoluteDir, pending);
    return pending;
  };

  const keepFlags = await Promise.all(
    matches.map(async (match) => {
      const absolutePath = posix.resolve(dependencies.currentDirectory, normalizeInputPath(match));
      if (hasSkippedSegmentBelowBase(absolutePath, absoluteBase)) {
        return false;
      }
      const directoriesFromBase = listDirectoriesBetween(absoluteBase, posix.dirname(absolutePath));
      const ownLayers = await Promise.all(directoriesFromBase.map(loadCachedLayer));
      const layers = [
        ...ancestorLayers,
        ...ownLayers.filter((layer): layer is IgnoreLayer => layer !== null)
      ];
      return !isIgnoredByPathOrParents(absolutePath, absoluteBase, layers);
    })
  );
  return matches.filter((_, index) => keepFlags[index] === true);
}

/**
 * Lists absolute directories from `fromDir` down to `toDir` (inclusive), or just `toDir` when it is
 * not inside `fromDir`.
 */
function listDirectoriesBetween(fromDir: string, toDir: string): string[] {
  const relativePath = posix.relative(fromDir, toDir);
  if (relativePath.startsWith('..')) {
    return [toDir];
  }
  const segments = relativePath.length === 0 ? [] : relativePath.split('/');
  return [
    fromDir,
    ...segments.map((_, index) => posix.join(fromDir, ...segments.slice(0, index + 1)))
  ];
}

/**
 * Checks a file and each of its parent directories below the base against the ignore layers,
 * mirroring how the walker never descends into ignored directories.
 */
function isIgnoredByPathOrParents(
  absolutePath: string,
  absoluteBase: string,
  layers: readonly IgnoreLayer[]
): boolean {
  const parentDirectories = listDirectoriesBetween(
    absoluteBase,
    posix.dirname(absolutePath)
  ).filter((dir) => dir !== absoluteBase);
  return (
    parentDirectories.some((dir) => isIgnoredByLayers(dir, true, layers)) ||
    isIgnoredByLayers(absolutePath, false, layers)
  );
}
