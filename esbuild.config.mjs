import { build } from 'esbuild';

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/revet.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: true,
  banner: { js: '#!/usr/bin/env node' },
});

console.log('built dist/revet.js');
