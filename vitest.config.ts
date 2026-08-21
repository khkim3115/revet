import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // perf.bench.ts asserts the G3 cold-start budget with plain `it()`, so it
    // must be included explicitly -- the default glob only picks up *.test.ts.
    include: ['test/**/*.test.ts', 'test/**/*.bench.ts'],
  },
});
