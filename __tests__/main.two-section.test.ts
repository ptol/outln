import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  executeCasefileFile,
  type CasefileExecutorOutput,
  type CaseInputFile
} from 'casefile-runner';

import { run } from '../src/main.js';
import { createVirtualFileSystem } from './support/virtual-fs.js';

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
 * Executes `src/main.ts` against in-memory virtual files from a two-section case.
 * @param files Virtual files parsed from a `.case.yaml` input section.
 * @param args CLI args parsed from the case `args` YAML list.
 * @returns Captured CLI output channels and process exit code.
 */
async function executeMainCase(
  files: CaseInputFile[],
  args: string[]
): Promise<CasefileExecutorOutput> {
  const fileSystem = createVirtualFileSystem(
    new Map(files.map((inputFile) => [inputFile.path, inputFile.content]))
  );

  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  await run(['node', 'main.ts', ...args], {
    ...fileSystem,
    writeOutput: (value) => {
      stdout += value;
    },
    writeError: (value) => {
      stderr += value;
    },
    readVersion: () => '1.2.3-test',
    setExitCode: (code) => {
      exitCode = code;
    }
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
