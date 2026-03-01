import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    snapshotFormat: {
      escapeString: true,
      printBasicPrototype: true
    }
  }
});
