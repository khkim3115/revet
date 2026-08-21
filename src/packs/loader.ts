import type { EventName, Verdict } from '../types.js';
import compiled from './compiled.json' with { type: 'json' };

export interface MatchSpec { command?: string; path?: string; content?: string; added?: string }
export interface Rule {
  id: string; event: EventName; match: MatchSpec;
  verdict: Verdict; message: string; why?: string; fix?: string;
}
export interface Pack { pack: string; version: number; rules: Rule[] }
export interface RevetConfig {
  packs: string[];
  overrides?: Record<string, Verdict | 'off'>;
  custom?: Rule[];
}

const PACKS = compiled as unknown as Record<string, Pack>;

export function loadRules(config: RevetConfig): Rule[] {
  const overrides = config.overrides ?? {};
  const out: Rule[] = [];

  for (const name of config.packs) {
    const pack = PACKS[name];
    if (!pack) throw new Error(`unknown pack: ${name}`);
    for (const rule of pack.rules) {
      const o = overrides[rule.id];
      if (o === 'off') continue;
      out.push(o ? { ...rule, verdict: o } : rule);
    }
  }
  out.push(...(config.custom ?? []));
  return out;
}
