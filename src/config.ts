import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { RevetConfig } from './packs/loader.js';

export const DEFAULT_CONFIG: RevetConfig = { packs: ['core'] };

export function loadConfig(cwd: string): RevetConfig {
  const file = join(cwd, '.claude', 'revet.yaml');
  if (!existsSync(file)) return DEFAULT_CONFIG;
  const parsed = parse(readFileSync(file, 'utf8')) as Partial<RevetConfig> | null;
  return { packs: parsed?.packs ?? ['core'], overrides: parsed?.overrides, custom: parsed?.custom };
}
