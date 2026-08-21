import { describe, it, expect } from 'vitest';
import { score } from '../../src/doctor/score.js';
import type { Observations } from '../../src/doctor/scan.js';

// The event names here are vendor lifecycle names, because that is what
// scan() actually reads out of settings.json -- the keys of `hooks`. Naming
// them after revet's internal event ids instead would make this fixture score
// zero on coverage while looking healthy to a reader.
const base: Observations = {
  events: ['PreToolUse', 'PostToolUse', 'SessionStart'],
  blockingGates: 2, totalGates: 2, runtimeResolvable: true,
  denyRules: ['Bash(rm -rf *)', 'Bash(git push --force *)'],
  broadAllows: [], contextFileLines: { 'CLAUDE.md': 90 },
};

describe('score', () => {
  it('grades a healthy harness at A or B', () => {
    expect(['A', 'B']).toContain(score(base).grade);
  });

  it('raises a CRITICAL when the runtime is not resolvable', () => {
    const r = score({ ...base, runtimeResolvable: false });
    expect(r.findings.some((f) => f.severity === 'critical' && f.dimension === 'resilience')).toBe(true);
    expect(r.dimensions.resilience).toBeLessThan(50);
  });

  it('penalizes warn-only gates as enforcement theater', () => {
    const r = score({ ...base, blockingGates: 0 });
    expect(r.dimensions.enforcement).toBeLessThan(50);
  });

  it('flags an oversized context file', () => {
    const r = score({ ...base, contextFileLines: { 'CLAUDE.md': 640 } });
    expect(r.findings.some((f) => f.dimension === 'context')).toBe(true);
  });

  it('flags an overly broad allow', () => {
    const r = score({ ...base, broadAllows: ['Bash(python *)'] });
    expect(r.findings.some((f) => f.dimension === 'permissions')).toBe(true);
  });
});

// The whole argument of this tool is that its numbers do not flatter the
// operator. These are the properties that claim has to rest on.
describe('score is not allowed to flatter', () => {
  it('a harness with no gates at all scores zero on enforcement, not full marks', () => {
    const r = score({ ...base, totalGates: 0, blockingGates: 0 });
    expect(r.dimensions.enforcement).toBe(0);
  });

  it('never lets a finding appear without lowering some dimension', () => {
    const clean = score({ ...base, events: ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop'] });
    const dirty = score({
      ...base, events: ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop'],
      broadAllows: ['Bash(python *)'],
    });
    expect(dirty.findings.length).toBeGreaterThan(clean.findings.length);
    expect(dirty.overall).toBeLessThan(clean.overall);
  });

  it('scores every dimension on the same 0-100 scale', () => {
    for (const r of [score(base), score({ ...base, runtimeResolvable: false })]) {
      for (const [dim, value] of Object.entries(r.dimensions)) {
        expect(value, dim).toBeGreaterThanOrEqual(0);
        expect(value, dim).toBeLessThanOrEqual(100);
      }
      expect(r.overall).toBeGreaterThanOrEqual(0);
      expect(r.overall).toBeLessThanOrEqual(100);
    }
  });

  it('gives every finding an actionable fix', () => {
    const r = score({
      ...base, runtimeResolvable: false, blockingGates: 0,
      broadAllows: ['Bash(python *)'], contextFileLines: { 'CLAUDE.md': 640 },
    });
    expect(r.findings.length).toBeGreaterThan(0);
    expect(r.findings.every((f) => f.fix.length > 0)).toBe(true);
  });
});
