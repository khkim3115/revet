import { readFileSync } from 'node:fs';
import { adapt } from './hook/adapter.js';
import { match } from './hook/matcher.js';
import { respond } from './hook/verdict.js';
import { loadRules } from './packs/loader.js';
import { loadConfig } from './config.js';
import type { EventName } from './types.js';

const EVENTS: EventName[] = ['pre-bash', 'pre-edit', 'post-edit'];

// Fail closed. docs/hook-contract.md records the measurement that makes this
// non-negotiable: a hook command that cannot even be resolved exits 127, and
// the agent runtime runs the tool anyway with is_error false. Nothing in the
// session shows that the gate was skipped. Exiting 2 on our own failures is
// the only way a broken revet is louder than a missing one.
function fail(msg: string): never {
  process.stderr.write(`[revet] ${msg}\n`);
  process.exit(2);
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    fail('could not read hook payload from stdin');
  }
}

function cmdHook(eventArg: string): void {
  if (!EVENTS.includes(eventArg as EventName)) fail(`unknown hook event: ${eventArg}`);

  let raw: unknown;
  try {
    raw = JSON.parse(readStdin());
  } catch {
    fail('hook payload was not valid JSON');
  }

  const event = eventArg as EventName;
  const rules = loadRules(loadConfig(process.cwd()));
  const { exitCode, stderr, stdout } = respond(match(adapt(event, raw), rules), event);

  // stdout carries the agent-visible channel and must stay parseable as JSON,
  // so nothing else is ever written there.
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(`${stderr}\n`);
  process.exit(exitCode);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'hook') cmdHook(arg ?? '');
else fail(`unknown command: ${cmd ?? '(none)'}`);
