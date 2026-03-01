/**
 * End-to-end workflow tests for iteration 027 debug directory mode.
 */

import { describe, expect, it } from 'vitest';

import { run } from '../src/main.js';

type VirtualFiles = Record<string, string>;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Checks if a path is a directory in the virtual filesystem.
 * A path is a directory if it's in the explicit directories list or contains files.
 */
function isVirtualDirectory(
  files: VirtualFiles,
  filePath: string,
  explicitDirs: readonly string[] = []
): boolean {
  const normalizedPath = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;

  // Check explicit directory list first
  if (explicitDirs.includes(normalizedPath)) {
    return true;
  }

  // Check if any files are under this path
  const prefix = normalizedPath + '/';
  for (const path of Object.keys(files)) {
    if (path.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Lists all files recursively in a virtual directory.
 */
function listVirtualFiles(files: VirtualFiles, dirPath: string): string[] {
  const normalizedDir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
  const prefix = normalizedDir + '/';
  const result: string[] = [];

  for (const path of Object.keys(files)) {
    if (path.startsWith(prefix)) {
      result.push(path);
    }
  }

  return result.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'variant' }));
}

async function runWithVirtualFiles(
  args: string[],
  files: VirtualFiles,
  explicitDirs: readonly string[] = []
): Promise<RunResult> {
  const fileContentByPath = new Map<string, string>(Object.entries(files));
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  await run(['node', 'main.ts', ...args], {
    fileExists: (filePath) => Promise.resolve(fileContentByPath.has(filePath)),
    isDirectory: (filePath) => Promise.resolve(isVirtualDirectory(files, filePath, explicitDirs)),
    readTextFile: (filePath) => {
      const content = fileContentByPath.get(filePath);
      if (content === undefined) {
        return Promise.reject(new Error(`Missing virtual file: ${filePath}`));
      }
      return Promise.resolve(content);
    },
    writeOutput: (value) => {
      stdout += value;
    },
    writeError: (value) => {
      stderr += value;
    },
    setExitCode: (code) => {
      exitCode = code;
    },
    listFiles: (dirPath) => Promise.resolve(listVirtualFiles(files, dirPath))
  });

  return { stdout, stderr, exitCode };
}

describe('iteration 027 debug directory mode (e2e)', () => {
  describe('happy path', () => {
    it('processes directory recursively and outputs sorted file debug output', async () => {
      const result = await runWithVirtualFiles(['--debug', 'input/pkg'], {
        'input/pkg/z-last.ts': 'export const zLast = 3;',
        'input/pkg/a-first.ts': 'export const aFirst = 1;',
        'input/pkg/nested/middle.ts': 'export const middle = 2;'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      // Files sorted lexicographically: a-first.ts, nested/middle.ts, z-last.ts
      // Note: no trailing newline after the last file's output
      expect(result.stdout).toBe(
        '\x1b[32mexport const aFirst\x1b[0m = 1;\n' +
          '\x1b[32mexport const middle\x1b[0m = 2;\n' +
          '\x1b[32mexport const zLast\x1b[0m = 3;'
      );
    });

    it('processes nested directory structure with multiple levels', async () => {
      const result = await runWithVirtualFiles(['--debug', 'input/deep'], {
        'input/deep/a.ts': 'export const a = 1;',
        'input/deep/level1/b.ts': 'export const b = 2;',
        'input/deep/level1/level2/c.ts': 'export const c = 3;',
        'input/deep/level1/level2/level3/d.ts': 'export const d = 4;'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      // Note: no trailing newline after the last file's output
      expect(result.stdout).toBe(
        '\x1b[32mexport const a\x1b[0m = 1;\n' +
          '\x1b[32mexport const b\x1b[0m = 2;\n' +
          '\x1b[32mexport const c\x1b[0m = 3;\n' +
          '\x1b[32mexport const d\x1b[0m = 4;'
      );
    });
  });

  describe('edge cases', () => {
    it('handles empty directory (no files to process)', async () => {
      const result = await runWithVirtualFiles(
        ['--debug', 'input/empty'],
        {
          // No files in the directory
        },
        ['input/empty']
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('');
    });

    it('handles directory with only unsupported files', async () => {
      const result = await runWithVirtualFiles(['--debug', 'input/unsupported'], {
        'input/unsupported/readme.md': '# Readme',
        'input/unsupported/data.json': '{"a": 1}'
      });

      // Markdown headings ARE supported now (they produce declaration spans)
      // JSON files are not supported
      expect(result.exitCode).toBe(1);
      // Markdown heading gets highlighted
      expect(result.stdout).toBe('\x1b[32m# Readme\x1b[0m');
      expect(result.stderr).toContain('HAS UNSUPPORTED FILE TYPE');
    });

    it('continues processing when some files have unsupported types', async () => {
      const result = await runWithVirtualFiles(['--debug', 'input/mixed'], {
        'input/mixed/c.ts': 'export const c = 3;',
        'input/mixed/a.ts': 'export const a = 1;',
        'input/mixed/raw.txt': 'plain text'
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('FILE input/mixed/raw.txt HAS UNSUPPORTED FILE TYPE');
      // Only TS files should be in output, sorted
      // Note: no trailing newline after the last file's output
      expect(result.stdout).toBe(
        '\x1b[32mexport const a\x1b[0m = 1;\n' + '\x1b[32mexport const c\x1b[0m = 3;'
      );
    });

    it('continues processing when some files cannot be read', async () => {
      // We'll simulate a read failure by having the file exist but throw on read
      const files: VirtualFiles = {
        'input/pkg/valid.ts': 'export const valid = 1;',
        'input/pkg/unreadable.ts': 'export const unreadable = 2;'
      };

      const fileContentByPath = new Map<string, string>(Object.entries(files));
      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      await run(['node', 'main.ts', '--debug', 'input/pkg'], {
        fileExists: (filePath) => Promise.resolve(fileContentByPath.has(filePath)),
        isDirectory: (filePath) => Promise.resolve(isVirtualDirectory(files, filePath)),
        readTextFile: (filePath) => {
          if (filePath === 'input/pkg/unreadable.ts') {
            return Promise.reject(new Error('Permission denied'));
          }
          const content = fileContentByPath.get(filePath);
          if (content === undefined) {
            return Promise.reject(new Error(`Missing virtual file: ${filePath}`));
          }
          return Promise.resolve(content);
        },
        writeOutput: (value) => {
          stdout += value;
        },
        writeError: (value) => {
          stderr += value;
        },
        setExitCode: (code) => {
          exitCode = code;
        },
        listFiles: (dirPath) => Promise.resolve(listVirtualFiles(files, dirPath))
      });

      expect(exitCode).toBe(1);
      expect(stderr).toBe('FILE input/pkg/unreadable.ts COULD NOT BE READ OR PARSED');
      // Note: no trailing newline after single file output
      expect(stdout).toBe('\x1b[32mexport const valid\x1b[0m = 1;');
    });
  });

  describe('error cases', () => {
    it('rejects multiple positional arguments with --debug', async () => {
      const result = await runWithVirtualFiles(['--debug', 'input/pkg', 'input/extra.ts'], {
        'input/pkg/a.ts': 'export const a = 1;',
        'input/extra.ts': 'export const extra = 2;'
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('--debug requires exactly one input file path.');
      expect(result.stdout).toBe('');
    });
  });
});
