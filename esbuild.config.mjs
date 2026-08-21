import { build } from 'esbuild';

// CommonJS, not ESM, and the choice is measured rather than stylistic: the ESM
// module graph plus the createRequire shim that a bundled `yaml` needs cost
// ~7.6ms of cold start, which is a tenth of the entire G3 budget. See
// test/perf.bench.ts. The .cjs extension is required because package.json
// declares "type": "module".
await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/revet.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  banner: { js: '#!/usr/bin/env node' },
});

console.log('built dist/revet.cjs');
