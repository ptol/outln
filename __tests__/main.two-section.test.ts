import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { minimatch } from 'minimatch';
import {
  executeCasefileFile,
  type CasefileExecutorOutput,
  type CaseInputFile
} from 'casefile-runner';

import { run } from '../src/main.js';

/**
 * Workspace root path used to resolve `.case.yaml` fixtures.
 */
const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Root directory that stores all two-section `.case.yaml` fixtures.
 */
const casesRoot = resolve(workspaceRoot, '__tests__/cases');
const shouldUpdateCases = process.env['UPDATE_CASES'] === '1';

/**
 * Recursively collects `.case.yaml` fixture paths under a directory.
 * @param directory Absolute path to the directory to scan.
 * @returns Sorted absolute paths of all discovered `.case.yaml` files.
 */
function collectCaseFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const casePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      casePaths.push(...collectCaseFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.case.yaml')) {
      casePaths.push(entryPath);
    }
  }

  return casePaths.sort((left, right) => left.localeCompare(right));
}

/**
 * Discovered two-section case file paths used to generate test cases.
 */
const discoveredCasePaths = collectCaseFiles(casesRoot);

/**
 * Decodes textual escape sequences used in fixtures into runtime bytes.
 * Keeps `.case.yaml` files readable while allowing ANSI assertions.
 */
function decodeFixtureEscapes(value: string): string {
  return value.replaceAll('\\x1b', '\x1b');
}

/**
 * Creates a globber function for virtual files.
 * @param availablePaths Array of available virtual file paths.
 * @returns Function that matches patterns against available paths.
 */
function createVirtualGlobber(availablePaths: string[]): (pattern: string) => Promise<string[]> {
  return async (pattern: string): Promise<string[]> => {
    return Promise.resolve(availablePaths.filter((path) => minimatch(path, pattern)));
  };
}

/**
 * Checks if a path represents a directory in the virtual filesystem.
 * A path is a directory if any file exists under it.
 * @param fileContentByPath Map of virtual file paths to contents.
 * @param filePath The path to check.
 * @returns True if the path is a directory.
 */
function isVirtualDirectory(fileContentByPath: Map<string, string>, filePath: string): boolean {
  const normalizedPath = filePath.endsWith('/') ? filePath.slice(0, -1) : filePath;
  const prefix = normalizedPath + '/';
  for (const path of fileContentByPath.keys()) {
    if (path.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/**
 * Lists all regular files recursively in a virtual directory.
 * Skips symlinked directories (not applicable in virtual fs).
 * Returns normalized file paths (forward slashes) sorted lexicographically.
 * @param fileContentByPath Map of virtual file paths to contents.
 * @param dirPath The directory path to list files from.
 * @returns Sorted array of file paths.
 */
function listVirtualFiles(fileContentByPath: Map<string, string>, dirPath: string): string[] {
  const normalizedDir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
  const prefix = normalizedDir + '/';
  const files: string[] = [];

  for (const path of fileContentByPath.keys()) {
    if (path.startsWith(prefix)) {
      files.push(path);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'variant' }));
}

/**
 * Executes `src/main.ts` against in-memory virtual files from a two-section case.
 * @param files Virtual files parsed from a `.case.yaml` input section.
 * @param args CLI args parsed from the case `args` YAML list.
 * @returns Captured CLI output channels and process exit code.
 */
async function executeMainCase(
  files: CaseInputFile[],
  args: string[]
): Promise<CasefileExecutorOutput> {
  const fileContentByPath = new Map(files.map((inputFile) => [inputFile.path, inputFile.content]));
  const availablePaths = files.map((f) => f.path);
  const virtualGlobber = createVirtualGlobber(availablePaths);

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  await run(['node', 'main.ts', ...args], {
    fileExists: (filePath) => Promise.resolve(fileContentByPath.has(filePath)),
    isDirectory: (filePath) => Promise.resolve(isVirtualDirectory(fileContentByPath, filePath)),
    readTextFile: (filePath) => {
      const content = fileContentByPath.get(filePath);
      if (content === undefined) {
        throw new Error(`Missing virtual file: ${filePath}`);
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
    globber: virtualGlobber,
    listFiles: (dirPath) => Promise.resolve(listVirtualFiles(fileContentByPath, dirPath))
  });

  return { stdout, stderr, exitCode };
}

describe('src/main.ts two-section cases', () => {
  it('has at least one .case.yaml fixture', () => {
    expect(discoveredCasePaths.length).toBeGreaterThan(0);
  });

  for (const casePath of discoveredCasePaths) {
    const caseName = relative(casesRoot, casePath);
    it(`matches expected output for ${caseName}`, async () => {
      const result = await executeCasefileFile(casePath, executeMainCase, {
        updateExpected: shouldUpdateCases
      });

      if (result.expectedStdout !== null) {
        expect(result.actualStdout).toBe(decodeFixtureEscapes(result.expectedStdout));
      }

      if (result.expectedStderr !== null) {
        expect(result.actualStderr).toBe(decodeFixtureEscapes(result.expectedStderr));
      }
    });
  }
});
