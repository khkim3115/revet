import { describe, it, expect } from 'vitest';
import { loadRules } from '../../src/packs/loader.js';
import { match } from '../../src/hook/matcher.js';
import type { HookEvent } from '../../src/types.js';

const rules = loadRules({ packs: ['core', 'legacy-php5'] });
const fires = (id: string, e: HookEvent) => match(e, rules).some((f) => f.rule.id === id);

describe('core pack', () => {
  it('core/destructive-rm fires on rm -rf and not on rm one-file', () => {
    expect(fires('core/destructive-rm', { event: 'pre-bash', command: 'rm -rf build' })).toBe(true);
    expect(fires('core/destructive-rm', { event: 'pre-bash', command: 'rm build/a.o' })).toBe(false);
  });

  it('core/git-force-push fires on --force but not --force-with-lease', () => {
    expect(fires('core/git-force-push', { event: 'pre-bash', command: 'git push --force' })).toBe(true);
    expect(fires('core/git-force-push', { event: 'pre-bash', command: 'git push --force-with-lease' })).toBe(false);
  });

  it('core/path-string-compare fires on naive path equality in added lines', () => {
    expect(fires('core/path-string-compare', {
      event: 'post-edit', path: 'a.js', added: 'if (file === repoRoot + "/src/x.js") {',
    })).toBe(true);
  });

  it('core/history-rewrite fires on filter-branch', () => {
    expect(fires('core/history-rewrite', { event: 'pre-bash', command: 'git filter-branch -f' })).toBe(true);
  });
});

describe('legacy-php5 pack', () => {
  const php = (added: string): HookEvent => ({ event: 'post-edit', path: 'src/a.php', added });

  it('flags null coalescing (PHP 7+)', () => {
    expect(fires('legacy-php5/null-coalescing', php('$a = $b ?? "x";'))).toBe(true);
  });

  it('flags short ternary (PHP 5.3+, banned by this pack)', () => {
    expect(fires('legacy-php5/short-ternary', php('$a = $b ?: "x";'))).toBe(true);
  });

  it('flags arrow functions (PHP 7.4+)', () => {
    expect(fires('legacy-php5/arrow-fn', php('$f = fn($x) => $x + 1;'))).toBe(true);
  });

  it('flags scalar type hints (PHP 7+)', () => {
    expect(fires('legacy-php5/scalar-typehint', php('function f(int $a): string {'))).toBe(true);
  });

  it('does not fire on plain PHP 5 code', () => {
    const e = php('function f($a) { return array_map("trim", $a); }');
    expect(match(e, rules).filter((f) => f.rule.id.startsWith('legacy-php5/'))).toEqual([]);
  });

  it('only applies to php files', () => {
    expect(fires('legacy-php5/null-coalescing', {
      event: 'post-edit', path: 'src/a.js', added: 'const a = b ?? "x";',
    })).toBe(false);
  });
});

// Every rule is a promise that something specific will be caught. A rule with
// no `why` is a linter line; a rule with one teaches. These are cheap to keep
// true and expensive to notice once broken.
describe('pack hygiene', () => {
  it('every rule carries a why and a fix', () => {
    const bare = rules.filter((r) => !r.why || !r.fix).map((r) => r.id);
    expect(bare).toEqual([]);
  });

  it('every rule id is namespaced by its pack and unique', () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^(core|legacy-php5)\/[a-z0-9-]+$/.test(id))).toBe(true);
  });

  it('every match pattern is a valid regular expression', () => {
    for (const rule of rules) {
      for (const [key, pattern] of Object.entries(rule.match)) {
        if (key === 'path') continue;
        expect(() => new RegExp(pattern as string), `${rule.id}.${key}`).not.toThrow();
      }
    }
  });
});
