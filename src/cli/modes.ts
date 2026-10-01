/**
 * CLI execution modes for file, glob, and debug workflows.
 */

import {
  extractSummaryFromFile,
  generateOutlineForFile,
  type OutlineGenerationResult
} from '../core/language-registry.js';
import { generateDebugOutput, validateDebugInput } from '../debug/debug-mode.js';
import { discoverInputFiles, isSupportedFilePath, type GlobViewInputs } from './input-discovery.js';
import { walkDirectory } from './file-walker.js';
import { formatReadFailure, readSourceFile } from './source-reader.js';
import type { ContentProcessor, RunDependencies } from './types.js';

interface PartitionedFilePaths {
  existingFilePaths: string[];
  missingFilePaths: string[];
}

interface OutlineCollection {
  outlines: string[];
  errors: string[];
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
 * Runs glob view mode: expands directories and globs, merges explicit files,
 * extracts summaries and prints one line per file.
 * @param displayArgs Original arguments, shown in the banner.
 */
export async function runGlobViewMode(
  displayArgs: string[],
  inputs: GlobViewInputs,
  dependencies: RunDependencies
): Promise<void> {
  const discovered = await discoverInputFiles(inputs, dependencies);
  for (const error of discovered.errors) {
    dependencies.writeError(error);
  }

  if (discovered.filePaths.length === 0) {
    if (discovered.errors.length === 0) {
      dependencies.writeError(`No supported files matched: ${displayArgs.join(' ')}`);
    }
    dependencies.setExitCode(1);
    return;
  }

  dependencies.writeOutput(`glob view: ${displayArgs.join(' ')}\n`);
  dependencies.writeOutput('Includes only header comments per file.\n');
  dependencies.writeOutput('For file-level outlines, use `outln [FILE]...`.\n');

  let hasReadFailure = false;
  for (const filePath of discovered.filePaths) {
    const summary = await summarizeFile(filePath, dependencies);
    if (summary.ok) {
      dependencies.writeOutput(summary.line);
    } else {
      dependencies.writeError(summary.error);
      hasReadFailure = true;
    }
  }

  dependencies.setExitCode(hasReadFailure || discovered.errors.length > 0 ? 1 : 0);
}

/**
 * Reads a supported file and formats its one-line summary, or the read error message.
 */
async function summarizeFile(
  filePath: string,
  dependencies: RunDependencies
): Promise<{ ok: true; line: string } | { ok: false; error: string }> {
  const source = await readSourceFile(filePath, dependencies);
  if (!source.ok) {
    return source;
  }
  try {
    const summary = extractSummaryFromFile(filePath, source.content).summary ?? null;
    const text = summary !== null && summary.length > 0 ? summary : '(no header comment available)';
    return { ok: true, line: `${filePath}: ${text}\n` };
  } catch (error) {
    return { ok: false, error: formatReadFailure(filePath, error) };
  }
}

/**
 * Reads and outlines one file, converting any read or parse failure into an error result.
 * Keeps one bad file from hiding the outlines of the others.
 */
async function outlineSingleFile(
  filePath: string,
  dependencies: RunDependencies,
  processor: ContentProcessor
): Promise<OutlineGenerationResult> {
  const source = await readSourceFile(filePath, dependencies);
  if (!source.ok) {
    return { supported: false, errorMessage: source.error };
  }
  try {
    return processor(filePath, source.content);
  } catch (error) {
    return { supported: false, errorMessage: formatReadFailure(filePath, error) };
  }
}

/**
 * Runs file mode: outline generation for explicit file paths.
 */
export async function runFileMode(
  filePaths: string[],
  dependencies: RunDependencies,
  processor: ContentProcessor
): Promise<void> {
  const fileExistsStates = await Promise.all(
    filePaths.map(async (filePathArg) => dependencies.fileExists(filePathArg))
  );
  const { existingFilePaths, missingFilePaths } = partitionFilePathsByExistence(
    filePaths,
    fileExistsStates
  );

  for (const missingFilePath of missingFilePaths) {
    dependencies.writeError(`File ${missingFilePath} does not exist`);
  }

  const processedResults = await Promise.all(
    existingFilePaths.map(async (filePath) => outlineSingleFile(filePath, dependencies, processor))
  );
  const { outlines, errors } = collectOutlines(processedResults);
  for (const error of errors) {
    dependencies.writeError(error);
  }

  if (outlines.length > 0) {
    dependencies.writeOutput(outlines.join('\n'));
  }

  if (missingFilePaths.length > 0 || errors.length > 0) {
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

  const source = await readSourceFile(filePath, dependencies);
  if (!source.ok) {
    return { success: false, error: source.error };
  }
  const content = source.content;

  const outlineResult = generateOutlineForFile({ filePath, content });
  if (!outlineResult.supported) {
    return {
      success: false,
      error: outlineResult.errorMessage ?? `FILE ${filePath} HAS UNSUPPORTED FILE TYPE`
    };
  }

  const result = outlineResult.result;
  if (result === undefined) {
    return { success: false, error: formatReadFailure(filePath) };
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
    // Directory input: supported, non-ignored files only
    filePaths = (await walkDirectory(inputPath, dependencies)).filter(isSupportedFilePath);
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
