import { build } from 'esbuild';

// `yaml` ships CommonJS, and its CJS build reaches for `require` at runtime.
// Bundling it into an ESM output therefore needs a `require` in scope. This one
// is createRequire-backed, and every call it services resolves a Node builtin,
// so nothing is ever looked up in node_modules at runtime (G4).
const REQUIRE_SHIM = [
  "import { createRequire as __revetCreateRequire } from 'node:module';",
  'const require = __revetCreateRequire(import.meta.url);',
].join('\n');

await build({
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/revet.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: true,
  banner: { js: `#!/usr/bin/env node\n${REQUIRE_SHIM}` },
});

console.log('built dist/revet.js');
