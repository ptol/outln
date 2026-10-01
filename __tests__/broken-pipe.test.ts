/**
 * Unit tests for the stdout error handler that silences broken pipes.
 */

import { describe, expect, it } from 'vitest';

import { createStdoutErrorHandler } from '../src/cli/broken-pipe.js';

/**
 * Creates an Error carrying a Node-style errno code.
 */
function errorWithCode(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('createStdoutErrorHandler', () => {
  it('exits with code 0 on EPIPE', () => {
    const exitCodes: number[] = [];
    const handle = createStdoutErrorHandler((code) => exitCodes.push(code));

    handle(errorWithCode('EPIPE'));

    expect(exitCodes).toEqual([0]);
  });

  it('rethrows other stdout errors', () => {
    const exitCodes: number[] = [];
    const handle = createStdoutErrorHandler((code) => exitCodes.push(code));

    expect(() => {
      handle(errorWithCode('EIO'));
    }).toThrow('EIO');
    expect(exitCodes).toEqual([]);
  });
});
