import { statSync } from 'node:fs';
import { basename, delimiter, isAbsolute, join } from 'node:path';

// Answers one question about a hook command: if the agent runtime fired this
// right now, would anything actually execute?
//
// It matters more than it looks. A hook whose command cannot be resolved exits
// 127, and the runtime then runs the tool anyway with is_error false -- measured,
// see docs/hook-contract.md. The gate is gone and the session looks healthy, so
// this check is the only thing standing between an operator and a harness that
// has quietly stopped enforcing anything.

const SHELL_BUILTINS = new Set([
  'echo', 'printf', 'true', 'false', ':', 'cd', 'exit', 'test', '[', 'set',
  'unset', 'export', 'pwd', 'read', 'shift', 'source', '.', 'eval', 'wait',
]);

// Resolving one of these proves only that the interpreter exists, which is
// never the interesting question -- `node` is always present, the script it was
// told to run is what goes missing.
const INTERPRETERS = new Set([
  'node', 'nodejs', 'python', 'python3', 'py', 'sh', 'bash', 'zsh', 'ruby',
  'perl', 'deno', 'bun', 'pwsh', 'powershell',
]);

// With one of these the interpreter is given code directly, so there is no
// script file to look for.
const INLINE_CODE_FLAGS = new Set(['-c', '-e', '--eval', '-Command', '--command', '-p']);

const WINDOWS_EXTENSIONS = ['', '.cmd', '.exe', '.bat', '.ps1', '.com'];
const EXTENSIONS = process.platform === 'win32' ? WINDOWS_EXTENSIONS : [''];

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Splits a command into tokens, honouring single and double quotes. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;

  for (const ch of command) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function isFile(path: string): boolean {
  for (const ext of EXTENSIONS) {
    try {
      if (statSync(path + ext).isFile()) return true;
    } catch { /* next candidate */ }
  }
  return false;
}

/** A path, resolved against the repository rather than against PATH. */
function fileAt(cwd: string, path: string): boolean {
  return isFile(isAbsolute(path) ? path : join(cwd, path));
}

function onSearchPath(name: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return dirs.some((dir) => isFile(join(dir, name)));
}

function executableExists(cwd: string, token: string): boolean {
  // Anything with a separator in it is a path, not a name to look up.
  if (token.includes('/') || token.includes('\\')) return fileAt(cwd, token);
  return onSearchPath(token);
}

export function isResolvable(cwd: string, command: string): boolean {
  const tokens = tokenize(command).filter((t) => !ENV_ASSIGNMENT.test(t));
  const executable = tokens[0];
  if (!executable) return false;

  const name = basename(executable).toLowerCase().replace(/\.(exe|cmd|bat|ps1|com)$/, '');
  if (SHELL_BUILTINS.has(name)) return true;   // the shell itself provides it

  if (!executableExists(cwd, executable)) return false;

  if (INTERPRETERS.has(name)) {
    const rest = tokens.slice(1);
    if (rest.some((t) => INLINE_CODE_FLAGS.has(t))) return true;
    const script = rest.find((t) => !t.startsWith('-'));
    // A script argument is a path in the repository, never a PATH lookup.
    if (script) return fileAt(cwd, script);
  }

  return true;
}

// A gate only counts as enforcing if it can actually return a blocking verdict.
// Matching the raw string for "revet hook" missed `node dist/revet.cjs hook`,
// which is how a repository that builds revet from source wires itself up, so
// this works off tokens instead.
const REVET_BINARY = /^revet(\.(c|m)?js|\.cmd|\.exe|\.ps1|\.bat)?$/i;

export function isBlockingGate(command: string): boolean {
  const tokens = tokenize(command);
  const revet = tokens.findIndex((t) => REVET_BINARY.test(basename(t)));
  if (revet !== -1 && tokens.slice(revet + 1).includes('hook')) return true;
  // Hand-rolled hooks that block do it by exiting 2; see docs/hook-contract.md.
  return /\bexit\s+2\b/.test(command);
}
