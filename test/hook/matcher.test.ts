import { describe, it, expect } from 'vitest';
import { sep } from 'node:path';
import { match } from '../../src/hook/matcher.js';
import type { Rule } from '../../src/packs/loader.js';

const rmRule: Rule = {
  id: 'core/destructive-rm', event: 'pre-bash',
  match: { command: '\\brm\\s+-rf\\b' }, verdict: 'block', message: 'blocked',
};

describe('match', () => {
  it('matches a command rule', () => {
    const f = match({ event: 'pre-bash', command: 'rm -rf /tmp' }, [rmRule]);
    expect(f).toHaveLength(1);
    expect(f[0].matched).toBe('rm -rf');
  });

  it('ignores rules for other events', () => {
    expect(match({ event: 'post-edit', path: '/a' }, [rmRule])).toEqual([]);
  });

  it('requires every declared matcher key to hit', () => {
    const rule: Rule = {
      id: 'x/y', event: 'post-edit',
      match: { path: 'src/**', added: 'TODO' }, verdict: 'warn', message: 'm',
    };
    expect(match({ event: 'post-edit', path: 'src/a.ts', added: 'TODO' }, [rule])).toHaveLength(1);
    expect(match({ event: 'post-edit', path: 'lib/a.ts', added: 'TODO' }, [rule])).toEqual([]);
    expect(match({ event: 'post-edit', path: 'src/a.ts', added: 'ok' }, [rule])).toEqual([]);
  });

  // Windows hands the hook a backslash path; the glob in a rule is always
  // written with forward slashes. G6: this must go through path normalization,
  // not string comparison, or the gate looks wired up and never fires.
  it('normalizes a native-separator path before glob matching', () => {
    const rule: Rule = {
      id: 'x/sep', event: 'post-edit',
      match: { path: '**/*.php' }, verdict: 'warn', message: 'm',
    };
    const native = ['src', 'app', 'a.php'].join(sep);
    expect(match({ event: 'post-edit', path: native, added: 'x' }, [rule])).toHaveLength(1);
  });
});
