/**
 * Test helper that runs the CLI against an in-memory set of virtual files and captures output.
 */

import { run } from '../../src/main.js';
import type { RunDependencies } from '../../src/cli/types.js';

/**
 * Virtual file map: path to file content.
 */
export type VirtualFiles = Record<string, string>;

/**
 * Captured CLI output channels and exit code.
 */
export interface VirtualRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Runs the CLI with the given args against virtual files.
 * @param args CLI arguments (without node and script path).
 * @param files Virtual files available to the CLI.
 * @param overrides Optional dependency overrides (e.g. failing readers).
 * @returns Captured stdout, stderr and exit code.
 */
export async function runWithVirtualFiles(
  args: string[],
  files: VirtualFiles,
  overrides: Partial<RunDependencies> = {}
): Promise<VirtualRunResult> {
  const fileContentByPath = new Map<string, string>(Object.entries(files));
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  await run(['node', 'main.ts', ...args], {
    fileExists: (filePath) => Promise.resolve(fileContentByPath.has(filePath)),
    isDirectory: () => Promise.resolve(false),
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
    ...overrides
  });

  return { stdout, stderr, exitCode };
}
