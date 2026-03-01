/**
 * CLI execution modes for file, glob, and debug workflows.
 */

import { glob } from 'glob';

import {
  extractSummaryFromFile,
  generateOutlineForFile,
  type OutlineGenerationResult
} from '../core/language-registry.js';
import { generateDebugOutput, validateDebugInput } from '../debug/debug-mode.js';
import type { ContentProcessor, RunDependencies } from './types.js';

const DEBUG_INPUT_ERROR = '--debug requires exactly one input file path.';

interface PartitionedFilePaths {
  existingFilePaths: string[];
  missingFilePaths: string[];
}

interface OutlineCollection {
  outlines: string[];
  errors: string[];
}

/**
 * Default glob function using the glob package.
 */
async function defaultGlob(pattern: string): Promise<string[]> {
  return glob(pattern, { nodir: true, follow: false });
}

/**
 * Normalizes path separators to forward slashes.
 */
function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * De-duplicates path matches after separator normalization and returns sorted output.
 */
function deduplicateAndSortMatches(matches: string[]): string[] {
  const uniquePaths = new Set<string>();
  const deduplicatedMatches: string[] = [];

  for (const match of matches) {
    const normalized = normalizePathSeparators(match);
    if (!uniquePaths.has(normalized)) {
      uniquePaths.add(normalized);
      deduplicatedMatches.push(normalized);
    }
  }

  deduplicatedMatches.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'variant' }));
  return deduplicatedMatches;
}

/**
 * Splits file paths based on previously computed existence state.
 */
function partitionFilePathsByExistence(
  filePaths: string[],
  fileExistsStates: boolean[]
): PartitionedFilePaths {
  const existingFilePaths: string[] = [];
  const missingFilePaths: string[] = [];

  for (const [index, filePathArg] of filePaths.entries()) {
    const exists = fileExistsStates[index] === true;
    if (exists) {
      existingFilePaths.push(filePathArg);
    } else {
      missingFilePaths.push(filePathArg);
    }
  }

  return { existingFilePaths, missingFilePaths };
}

/**
 * Splits processor results into successful outlines and emitted error messages.
 */
function collectOutlines(processedResults: OutlineGenerationResult[]): OutlineCollection {
  const outlines: string[] = [];
  const errors: string[] = [];

  for (const result of processedResults) {
    if (result.supported) {
      outlines.push(result.result?.outline ?? '');
    } else {
      errors.push(result.errorMessage ?? 'Unknown error');
    }
  }

  return { outlines, errors };
}

/**
 * Writes an error and marks process exit as failure.
 */
export function failWithError(dependencies: RunDependencies, message: string): void {
  dependencies.writeError(message);
  dependencies.setExitCode(1);
}

/**
 * Runs glob view mode: expands patterns, extracts summaries, prints compact output.
 */
export async function runGlobViewMode(
  patterns: string[],
  dependencies: RunDependencies
): Promise<void> {
  const globber = dependencies.globber ?? defaultGlob;

  const allMatches: string[] = [];
  for (const pattern of patterns) {
    const matches = await globber(pattern);
    allMatches.push(...matches);
  }

  const deduplicatedMatches = deduplicateAndSortMatches(allMatches);
  if (deduplicatedMatches.length === 0) {
    dependencies.writeError(`No files matched glob patterns: ${patterns.join(' ')}`);
    dependencies.setExitCode(1);
    return;
  }

  dependencies.writeOutput(`glob view: ${patterns.join(' ')}\n`);
  dependencies.writeOutput('Includes only header comments per file.\n');
  dependencies.writeOutput('For file-level outlines, use `outln [FILE]...`.\n');

  let hasReadFailure = false;
  for (const relativePath of deduplicatedMatches) {
    let content: string;
    try {
      content = await dependencies.readTextFile(relativePath);
    } catch {
      dependencies.writeError(`FILE ${relativePath} COULD NOT BE READ OR PARSED`);
      hasReadFailure = true;
      continue;
    }

    const result = extractSummaryFromFile(relativePath, content);
    if (!result.supported) {
      dependencies.writeError(
        result.errorMessage ?? `FILE ${relativePath} HAS UNSUPPORTED FILE TYPE`
      );
      continue;
    }

    const summary = result.summary ?? null;
    if (summary !== null && summary.length > 0) {
      dependencies.writeOutput(`${relativePath}: ${summary}\n`);
    } else {
      dependencies.writeOutput(`${relativePath}: (no header comment available)\n`);
    }
  }

  dependencies.setExitCode(hasReadFailure ? 1 : 0);
}

/**
 * Runs file mode: outline generation for explicit file paths.
 */
export async function runFileMode(
  filePaths: string[],
  dependencies: RunDependencies,
  processor: ContentProcessor
): Promise<void> {
  let hasFailure = false;
  const fileExistsStates = await Promise.all(
    filePaths.map(async (filePathArg) => dependencies.fileExists(filePathArg))
  );
  const { existingFilePaths, missingFilePaths } = partitionFilePathsByExistence(
    filePaths,
    fileExistsStates
  );

  for (const missingFilePath of missingFilePaths) {
    hasFailure = true;
    dependencies.writeError(`File ${missingFilePath} does not exist`);
  }

  if (existingFilePaths.length > 0) {
    try {
      const contents = await Promise.all(
        existingFilePaths.map(async (filePathArg) => dependencies.readTextFile(filePathArg))
      );
      const processedResults = contents.map((content, index) => {
        const filePath = existingFilePaths[index];
        if (filePath === undefined) {
          throw new Error(`Missing file path at index ${index.toString()}`);
        }
        return processor(filePath, content);
      });

      const { outlines, errors } = collectOutlines(processedResults);
      for (const error of errors) {
        hasFailure = true;
        dependencies.writeError(error);
      }

      if (outlines.length > 0) {
        dependencies.writeOutput(outlines.join('\n'));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      dependencies.writeError(`Failed to read input files: ${message}`);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    dependencies.setExitCode(1);
  }
}

/**
 * Processes a single file for debug mode.
 * Returns the debug output or an error message.
 */
async function processDebugFile(
  filePath: string,
  dependencies: RunDependencies
): Promise<{ success: true; output: string } | { success: false; error: string }> {
  const exists = await dependencies.fileExists(filePath);
  if (!exists) {
    return { success: false, error: `File ${filePath} does not exist` };
  }

  let content: string;
  try {
    content = await dependencies.readTextFile(filePath);
  } catch {
    return { success: false, error: `FILE ${filePath} COULD NOT BE READ OR PARSED` };
  }

  const outlineResult = generateOutlineForFile({ filePath, content });
  if (!outlineResult.supported) {
    return {
      success: false,
      error: outlineResult.errorMessage ?? `FILE ${filePath} HAS UNSUPPORTED FILE TYPE`
    };
  }

  const result = outlineResult.result;
  if (result === undefined) {
    return { success: false, error: `FILE ${filePath} COULD NOT BE READ OR PARSED` };
  }

  const debugOutput = generateDebugOutput(content, result);
  return { success: true, output: debugOutput };
}

/**
 * Runs debug mode: validates input and generates ANSI-highlighted debug output.
 * Supports both single files and directories (recursive).
 */
export async function runDebugMode(args: string[], dependencies: RunDependencies): Promise<void> {
  const validation = validateDebugInput(args);
  if (!validation.valid) {
    failWithError(dependencies, validation.error);
    return;
  }

  const inputPath = validation.arg;

  // Determine if input is a directory and collect files to process
  let filePaths: string[];
  const isDir = await dependencies.isDirectory(inputPath);

  if (isDir) {
    // Directory input: collect all files recursively
    if (dependencies.listFiles === undefined) {
      failWithError(dependencies, DEBUG_INPUT_ERROR);
      return;
    }
    filePaths = await dependencies.listFiles(inputPath);
  } else {
    // Single file input
    filePaths = [inputPath];
  }

  // Process all files and collect results
  const outputs: string[] = [];
  let hasError = false;

  for (const filePath of filePaths) {
    const result = await processDebugFile(filePath, dependencies);
    if (result.success) {
      outputs.push(result.output);
    } else {
      hasError = true;
      dependencies.writeError(result.error);
    }
  }

  // Concatenate successful outputs with single newline separators
  if (outputs.length > 0) {
    dependencies.writeOutput(outputs.join('\n'));
  }

  dependencies.setExitCode(hasError ? 1 : 0);
}
