import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isBlockingGate, isResolvable } from './resolve.js';

export interface Observations {
  events: string[];
  blockingGates: number;
  totalGates: number;
  runtimeResolvable: boolean;
  unresolvableCommands: string[];
  denyRules: string[];
  broadAllows: string[];
  contextFileLines: Record<string, number>;
}

const BROAD = /\(\s*\*\s*\)|\b\w+\s+\*\s*\)/;
const CONTEXT_FILES = ['CLAUDE.md', 'AGENTS.md'];

// D3: offline, read-only, and it never executes a hook. Pointing this at
// somebody else's repository has to be a safe thing to do, or nobody will.
export function scan(cwd: string): Observations {
  const settingsPath = join(cwd, '.claude', 'settings.json');
  let settings: Record<string, any> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, any>;
    } catch {
      // Unparseable settings means no gate in it is running. Leaving the
      // observations empty makes that show up as zero coverage and an
      // unresolvable runtime, which is exactly what is true.
      settings = {};
    }
  }

  const hooks: Record<string, any> = settings.hooks ?? {};
  const events = Object.keys(hooks);

  const commands: string[] = [];
  for (const entries of Object.values(hooks)) {
    for (const entry of (entries as any[]) ?? []) {
      for (const h of entry?.hooks ?? []) {
        if (typeof h?.command === 'string') commands.push(h.command);
      }
    }
  }

  const permissions: Record<string, any> = settings.permissions ?? {};
  const allow: string[] = permissions.allow ?? [];

  const contextFileLines: Record<string, number> = {};
  for (const name of CONTEXT_FILES) {
    const p = join(cwd, name);
    if (existsSync(p)) contextFileLines[name] = readFileSync(p, 'utf8').split('\n').length;
  }

  // Every gate is checked, not just revet's own. A hook pointing at a script
  // that has been deleted or renamed fails exactly the same way, and it is far
  // likelier to be the one nobody notices.
  const unresolvableCommands = commands.filter((c) => !isResolvable(cwd, c));

  return {
    events,
    totalGates: commands.length,
    blockingGates: commands.filter(isBlockingGate).length,
    // No gates at all is not "resilient" either; there is simply nothing there.
    runtimeResolvable: commands.length > 0 && unresolvableCommands.length === 0,
    unresolvableCommands,
    denyRules: permissions.deny ?? [],
    broadAllows: allow.filter((a) => BROAD.test(a)),
    contextFileLines,
  };
}
