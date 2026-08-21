import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const CLI = resolve('dist/revet.cjs');
const WARN_REPO = resolve('test/fixtures/warn-repo');

function runHook(
  event: string,
  payload: unknown,
  cwd?: string,
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [CLI, 'hook', event], {
      input: JSON.stringify(payload), encoding: 'utf8', cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e: any) {
    return { code: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('revet hook', () => {
  it('blocks a destructive command', () => {
    const r = runHook('pre-bash', { tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('core/destructive-rm');
  });

  it('passes a harmless command', () => {
    expect(runHook('pre-bash', { tool_name: 'Bash', tool_input: { command: 'ls -la' } }).code).toBe(0);
  });

  it('exits non-zero and says so on an unknown event (fail closed)', () => {
    const r = runHook('nonsense', {});
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('revet');
  });

  it('exits non-zero on malformed stdin (fail closed)', () => {
    try {
      execFileSync('node', [CLI, 'hook', 'pre-bash'],
        { input: 'not json', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      throw new Error('should have failed');
    } catch (e: any) {
      expect(e.status).not.toBe(0);
    }
  });

  it('produces no stdout at all when nothing matches', () => {
    const r = runHook('pre-bash', { tool_name: 'Bash', tool_input: { command: 'ls -la' } });
    expect(r.stdout).toBe('');
  });
});

// Pinned by docs/hook-contract.md, which was measured rather than inferred: a
// warn has to exit 0 and ride the stdout JSON channel. If it ever regresses to
// a non-zero exit code the agent stops seeing warnings entirely, and the
// harness turns into theater without any visible symptom.
describe('revet hook, warn channel', () => {
  const downgraded = { tool_name: 'Bash', tool_input: { command: 'rm -rf /tmp/x' } };

  it('reads .claude/revet.yaml and applies the downgrade', () => {
    expect(runHook('pre-bash', downgraded, WARN_REPO).code).toBe(0);
  });

  it('emits additionalContext JSON on stdout', () => {
    const payload = JSON.parse(runHook('pre-bash', downgraded, WARN_REPO).stdout);
    expect(payload.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(payload.hookSpecificOutput.additionalContext).toContain('core/destructive-rm');
  });

  it('never emits permissionDecision, which would widen user permissions', () => {
    expect(runHook('pre-bash', downgraded, WARN_REPO).stdout).not.toContain('permissionDecision');
  });
});
