/**
 * Test helper that runs the CLI against an in-memory set of virtual files and captures output.
 */

import { run } from '../../src/main.js';
import type { RunDependencies } from '../../src/cli/types.js';
import { createVirtualFileSystem } from './virtual-fs.js';

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
 * Optional knobs for a virtual run.
 */
export interface VirtualRunOptions {
  /** Directories that exist without containing files. */
  emptyDirectories?: readonly string[];
  /** Dependency overrides (e.g. failing readers). */
  overrides?: Partial<RunDependencies>;
}

/**
 * Runs the CLI with the given args against virtual files.
 * @param args CLI arguments (without node and script path).
 * @param files Virtual files available to the CLI.
 * @param options Empty directories and dependency overrides.
 * @returns Captured stdout, stderr and exit code.
 */
export async function runWithVirtualFiles(
  args: string[],
  files: VirtualFiles,
  options: VirtualRunOptions = {}
): Promise<VirtualRunResult> {
  const fileSystem = createVirtualFileSystem(
    new Map<string, string>(Object.entries(files)),
    options.emptyDirectories
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
    },
    ...options.overrides
  });

  return { stdout, stderr, exitCode };
}
