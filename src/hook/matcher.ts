import { posix, sep } from 'node:path';
import type { HookEvent } from '../types.js';
import type { Rule, MatchSpec } from '../packs/loader.js';

export interface Finding { rule: Rule; matched: string }

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // Single pass so that `**` and `*` cannot be confused, and so no sentinel
  // character has to be reserved out of the glob alphabet.
  const body = escaped.replace(/\*\*|\*/g, (m) => (m === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${body}$`);
}

// G6: paths go through the path module before they are compared, never through
// raw string equality. A separator mismatch here would disable a gate while
// leaving it looking wired up -- the failure is invisible from inside a session.
function normalize(p: string): string {
  return posix.normalize(p.split(sep).join(posix.sep));
}

function hit(spec: MatchSpec, key: keyof MatchSpec, event: HookEvent): string | null {
  const pattern = spec[key];
  if (pattern === undefined) return null;
  const value = key === 'command' ? event.command : key === 'path' ? event.path
    : key === 'content' ? event.content : event.added;
  if (value === undefined) return '';
  if (key === 'path') return globToRegExp(pattern).test(normalize(value)) ? value : '';
  return new RegExp(pattern).exec(value)?.[0] ?? '';
}

export function match(event: HookEvent, rules: Rule[]): Finding[] {
  const out: Finding[] = [];
  for (const rule of rules) {
    if (rule.event !== event.event) continue;
    const keys = Object.keys(rule.match) as (keyof MatchSpec)[];
    const results = keys.map((k) => hit(rule.match, k, event));
    if (results.some((r) => r === '')) continue;
    out.push({ rule, matched: results.find((r) => r) ?? '' });
  }
  return out;
}
