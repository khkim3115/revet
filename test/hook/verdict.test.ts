import { describe, it, expect } from 'vitest';
import { resolve, respond } from '../../src/hook/verdict.js';
import type { Rule } from '../../src/packs/loader.js';

const mk = (verdict: 'warn' | 'block'): Rule => ({
  id: `t/${verdict}`, event: 'pre-bash', match: {}, verdict, message: `${verdict} msg`,
});

describe('resolve', () => {
  it('passes with no findings', () => {
    expect(resolve([])).toEqual({ verdict: 'pass', exitCode: 0, stderr: '' });
  });

  it('takes the highest severity', () => {
    const r = resolve([
      { rule: mk('warn'), matched: 'a' },
      { rule: mk('block'), matched: 'b' },
    ]);
    expect(r.verdict).toBe('block');
    expect(r.exitCode).toBe(2);
  });

  it('includes rule id and message in stderr', () => {
    const r = resolve([{ rule: mk('warn'), matched: 'a' }]);
    expect(r.stderr).toContain('t/warn');
    expect(r.stderr).toContain('warn msg');
  });
});

// The shapes below are pinned by docs/hook-contract.md, which was measured
// rather than inferred. Changing them without re-running the probes there will
// silently turn warnings into no-ops.
describe('respond', () => {
  const warn = [{ rule: mk('warn'), matched: 'a' }];
  const block = [{ rule: mk('block'), matched: 'b' }];

  it('says nothing at all on pass', () => {
    expect(respond([], 'pre-bash')).toEqual({
      verdict: 'pass', exitCode: 0, stderr: '', stdout: '',
    });
  });

  it('delivers a warn through additionalContext and exits 0, never a non-zero code', () => {
    const r = respond(warn, 'pre-bash');
    expect(r.exitCode).toBe(0);
    const payload = JSON.parse(r.stdout);
    expect(payload.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(payload.hookSpecificOutput.additionalContext).toContain('warn msg');
  });

  it('never emits permissionDecision, which would widen the user permissions', () => {
    expect(respond(warn, 'pre-bash').stdout).not.toContain('permissionDecision');
    expect(respond(block, 'pre-bash').stdout).not.toContain('permissionDecision');
  });

  it('tags a post-edit warn as PostToolUse', () => {
    const payload = JSON.parse(respond(warn, 'post-edit').stdout);
    expect(payload.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  });

  it('blocks with exit 2 and stderr, and writes no stdout', () => {
    const r = respond(block, 'pre-bash');
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('block msg');
    expect(r.stdout).toBe('');
  });
});
