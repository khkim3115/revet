import { describe, it, expect } from 'vitest';
import { loadRules } from '../../src/packs/loader.js';

describe('loadRules', () => {
  it('loads rules from a named built-in pack', () => {
    const rules = loadRules({ packs: ['core'] });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.id.startsWith('core/'))).toBe(true);
  });

  it('applies a verdict override', () => {
    const rules = loadRules({ packs: ['core'], overrides: { 'core/destructive-rm': 'warn' } });
    expect(rules.find((r) => r.id === 'core/destructive-rm')?.verdict).toBe('warn');
  });

  it('drops a rule turned off', () => {
    const rules = loadRules({ packs: ['core'], overrides: { 'core/destructive-rm': 'off' } });
    expect(rules.find((r) => r.id === 'core/destructive-rm')).toBeUndefined();
  });

  it('appends custom rules', () => {
    const custom = {
      id: 'local/x', event: 'post-edit' as const,
      match: { added: 'XXX' }, verdict: 'warn' as const, message: 'no XXX',
    };
    expect(loadRules({ packs: [], custom: [custom] })).toEqual([custom]);
  });

  it('throws on an unknown pack name', () => {
    expect(() => loadRules({ packs: ['nope'] })).toThrow(/unknown pack/i);
  });
});
