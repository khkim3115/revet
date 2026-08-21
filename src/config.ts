import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RevetConfig } from './packs/loader.js';

export const DEFAULT_CONFIG: RevetConfig = { packs: ['core'] };

export async function loadConfig(cwd: string): Promise<RevetConfig> {
  const file = join(cwd, '.claude', 'revet.yaml');
  if (!existsSync(file)) return DEFAULT_CONFIG;

  // Deferred on purpose. The YAML parser is ~113 KB and costs ~10ms to
  // initialize -- measured, see test/perf.bench.ts. The hook path runs in front
  // of every Bash call the agent makes, so it must not pay for a parser the
  // repository has given it nothing to parse. Built-in packs are precompiled to
  // JSON at build time for exactly the same reason.
  const { parse } = await import('yaml');
  const parsed = parse(readFileSync(file, 'utf8')) as Partial<RevetConfig> | null;
  return { packs: parsed?.packs ?? ['core'], overrides: parsed?.overrides, custom: parsed?.custom };
}
