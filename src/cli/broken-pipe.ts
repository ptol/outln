/**
 * Handling for stdout write errors, so a closed pipe (e.g. `outln … | head`) exits quietly.
 */

/**
 * Creates a stdout `error` listener that exits successfully on EPIPE and rethrows anything else.
 * @param exit Process exit function, injected for testability.
 * @returns Listener suitable for `process.stdout.on('error', …)`.
 */
export function createStdoutErrorHandler(exit: (code: number) => void): (error: Error) => void {
  return (error) => {
    if ((error as NodeJS.ErrnoException).code === 'EPIPE') {
      exit(0);
      return;
    }
    throw error;
  };
}
