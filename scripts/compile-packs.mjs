// Precompiles every YAML rule pack into a single JSON module so the hook path
// never parses YAML. Runs at build time only; `yaml` stays a devDependency.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const out = {};
for (const file of readdirSync('packs').filter((f) => f.endsWith('.yaml'))) {
  const pack = parse(readFileSync(join('packs', file), 'utf8'));
  out[pack.pack] = pack;
}
mkdirSync('src/packs', { recursive: true });
writeFileSync('src/packs/compiled.json', JSON.stringify(out, null, 2));
console.log(`compiled ${Object.keys(out).length} pack(s)`);
