/**
 * Unit tests for gitignore-aware directory walking and glob-match filtering.
 */

import { describe, expect, it } from 'vitest';

import {
  filterIgnoredMatches,
  getGlobBaseDirectory,
  walkDirectory,
  type WalkerDependencies
} from '../src/cli/file-walker.js';
import { isGlobPattern } from '../src/cli/input-arguments.js';
import { createVirtualFileSystem } from './support/virtual-fs.js';

/**
 * Builds walker dependencies over virtual files.
 */
function virtualWalker(files: Record<string, string>): WalkerDependencies {
  return createVirtualFileSystem(new Map(Object.entries(files)));
}

describe('walkDirectory', () => {
  it('skips symlinks and non-regular entries', async () => {
    const dependencies: WalkerDependencies = {
      ...virtualWalker({ 'pkg/a.ts': '' }),
      readDirectory: () =>
        Promise.resolve([
          { name: 'a.ts', kind: 'file' },
          { name: 'linked', kind: 'symlink' },
          { name: 'socket', kind: 'other' }
        ])
    };

    expect(await walkDirectory('pkg', dependencies)).toEqual(['pkg/a.ts']);
  });

  it('walks the current directory without a ./ prefix', async () => {
    const dependencies = virtualWalker({ 'a.ts': '', 'src/b.ts': '' });

    expect(await walkDirectory('.', dependencies)).toEqual(['a.ts', 'src/b.ts']);
  });

  it('keeps an absolute root in output paths', async () => {
    const dependencies = virtualWalker({ 'pkg/a.ts': '' });

    expect(await walkDirectory('/virtual/pkg/', dependencies)).toEqual(['/virtual/pkg/a.ts']);
  });

  it('treats a .git file (worktree) as the git root marker', async () => {
    const dependencies = virtualWalker({
      'repo/.git': 'gitdir: ../.bare',
      'repo/.gitignore': 'ignored.ts\n',
      'repo/src/ignored.ts': '',
      'repo/src/kept.ts': ''
    });

    expect(await walkDirectory('repo/src', dependencies)).toEqual(['repo/src/kept.ts']);
  });
});

describe('filterIgnoredMatches', () => {
  it('drops matches below node_modules and dot directories but keeps them in the base', async () => {
    const dependencies = virtualWalker({});
    const matches = ['.config/a.ts', '.config/node_modules/b.ts', '.config/.cache/c.ts'];

    expect(await filterIgnoredMatches(matches, '.config', dependencies)).toEqual(['.config/a.ts']);
  });
});

describe('getGlobBaseDirectory', () => {
  it.each([
    ['src/**/*.ts', 'src'],
    ['*.ts', '.'],
    ['a/b/[id]/*.tsx', 'a/b'],
    ['/abs/dir/*.md', '/abs/dir'],
    ['/*.md', '/'],
    ['src/{a,b}/*.ts', 'src']
  ])('returns the literal base of %s', (pattern, expected) => {
    expect(getGlobBaseDirectory(pattern, isGlobPattern)).toBe(expected);
  });
});
