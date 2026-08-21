import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan } from '../../src/doctor/scan.js';
import { isBlockingGate, isResolvable, tokenize } from '../../src/doctor/resolve.js';

let repo: string;

function withHooks(commands: string[]): string {
  const dir = mkdtempSync(join(repo, 'r-'));
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: 'Bash',
        hooks: commands.map((command) => ({ type: 'command', command })),
      }],
    },
  }));
  return dir;
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'revet-scan-'));
  mkdirSync(join(repo, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(join(repo, 'node_modules', '.bin', 'revet'), '#!/bin/sh\n');
  chmodSync(join(repo, 'node_modules', '.bin', 'revet'), 0o755);
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  writeFileSync(join(repo, 'scripts', 'gate.mjs'), '// a real gate\n');
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('tokenize', () => {
  it('keeps a quoted argument together', () => {
    expect(tokenize(`echo '[warn] a file was edited' >&2`))
      .toEqual(['echo', '[warn] a file was edited', '>&2']);
  });
});

describe('isResolvable', () => {
  it('accepts a locally installed binary referenced by path', () => {
    expect(isResolvable(repo, 'node_modules/.bin/revet hook pre-bash')).toBe(true);
  });

  it('rejects that same path when the package is not installed', () => {
    expect(isResolvable(join(repo, 'scripts'), 'node_modules/.bin/revet hook pre-bash')).toBe(false);
  });

  it('accepts an interpreter whose script exists', () => {
    expect(isResolvable(repo, 'node scripts/gate.mjs')).toBe(true);
  });

  // The reason this module exists. Resolving `node` proves nothing: node is
  // always installed, and the script it was told to run is what goes missing.
  it('rejects an interpreter whose script has been deleted', () => {
    expect(isResolvable(repo, 'node scripts/deleted-gate.mjs')).toBe(false);
  });

  it('accepts an interpreter given inline code with no script file', () => {
    expect(isResolvable(repo, `node -e "process.exit(0)"`)).toBe(true);
  });

  it('accepts a shell builtin', () => {
    expect(isResolvable(repo, `echo '[warn] a file was edited' >&2`)).toBe(true);
  });

  it('rejects a relative script that does not exist', () => {
    expect(isResolvable(repo, './scripts/missing.sh')).toBe(false);
  });

  it('rejects an absolute path that does not exist', () => {
    expect(isResolvable(repo, '/nonexistent/definitely/not/here --flag')).toBe(false);
  });

  it('ignores leading environment assignments', () => {
    expect(isResolvable(repo, 'DEBUG=1 node scripts/gate.mjs')).toBe(true);
    expect(isResolvable(repo, 'DEBUG=1 node scripts/deleted-gate.mjs')).toBe(false);
  });

  it('rejects an empty command', () => {
    expect(isResolvable(repo, '   ')).toBe(false);
  });
});

describe('scan reports which gate is dead', () => {
  it('names every unresolvable command, not just revet ones', () => {
    const dir = withHooks(['node ../scripts/gate.mjs', './hooks/deleted.sh']);
    const obs = scan(dir);
    expect(obs.totalGates).toBe(2);
    expect(obs.unresolvableCommands).toEqual(['./hooks/deleted.sh']);
    expect(obs.runtimeResolvable).toBe(false);
  });

  // The old check short-circuited on `!command.includes('revet')`, so a hook
  // pointing at any other missing script was assumed fine. That is the silent
  // no-op this dimension is supposed to catch.
  it('does not assume a non-revet command is fine', () => {
    const obs = scan(withHooks(['./hooks/some-other-gate.sh']));
    expect(obs.runtimeResolvable).toBe(false);
  });

  it('treats a resolvable non-revet gate as healthy', () => {
    const obs = scan(withHooks([`echo 'linting' >&2`]));
    expect(obs.unresolvableCommands).toEqual([]);
    expect(obs.runtimeResolvable).toBe(true);
  });

  it('reports an unparseable settings.json as having no gates rather than crashing', () => {
    const dir = mkdtempSync(join(repo, 'r-'));
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'settings.json'), '{ not json');
    const obs = scan(dir);
    expect(obs.totalGates).toBe(0);
    expect(obs.runtimeResolvable).toBe(false);
  });
});

describe('isBlockingGate', () => {
  it('recognizes revet installed as a local binary', () => {
    expect(isBlockingGate('node_modules/.bin/revet hook pre-bash')).toBe(true);
  });

  // How a repository that builds revet from source wires itself up. A raw
  // string match on "revet hook" misses this, which made revet score itself
  // as pure warn-only theater.
  it('recognizes revet run from a built bundle', () => {
    expect(isBlockingGate('node dist/revet.cjs hook pre-bash')).toBe(true);
  });

  it('recognizes a hand-rolled hook that exits 2', () => {
    expect(isBlockingGate('sh -c "grep -q TODO && exit 2"')).toBe(true);
  });

  it('does not count a warn-only echo hook', () => {
    expect(isBlockingGate("echo '[warn] a file was edited' >&2")).toBe(false);
  });

  it('does not count revet subcommands that cannot block', () => {
    expect(isBlockingGate('node_modules/.bin/revet doctor --json')).toBe(false);
  });
});
